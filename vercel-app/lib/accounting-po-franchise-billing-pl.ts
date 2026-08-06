/**
 * 승인된 회계 PO(로열티·배달 GP·Grab GP) → 손익 전기 집계.
 * VAT 포함 = purchase_orders.total, VAT 제외 = subtotal (원천세는 P&L에서 차감하지 않음).
 * 서버 전용 — 클라이언트는 accounting-po-franchise-billing-pl-shared 만 import.
 */
import 'server-only'
import {
  isAccountingPurchaseOrderByCartJson,
  parsePurchaseOrderCart,
  purchaseOrderMetaOrderDate,
  resolveAccountingPoIssuerStore,
  resolveAccountingPoReceivableStoreName,
  type PoBillingKind,
  type PoCartLine,
} from '@/lib/purchase-order-cart'
import { PL_FRANCHISE_BILLING_SALES_KEY } from '@/lib/accounting-po-franchise-billing-pl-shared'

export { PL_FRANCHISE_BILLING_SALES_KEY }
import {
  ensureErpStoreMatchIndex,
  storeMatchesIncomeFilterWithIndex,
} from '@/lib/accounting-store-match'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

function isHqIssuerOrRelated(store: string): boolean {
  const s = String(store || '').trim()
  if (!s) return false
  return isOfficeStore(s) || isHeadOfficeLikeStoreName(s) || s.startsWith('Office-')
}

export type FranchiseBillingKindAmounts = {
  royaltyGross: number
  royaltyNet: number
  deliveryGpGross: number
  deliveryGpNet: number
  grabGpGross: number
  grabGpNet: number
  /** billingKind === 'all' 이고 라인 분류 불가분 */
  combinedGross: number
  combinedNet: number
}

export type FranchiseBillingPlSlice = FranchiseBillingKindAmounts & {
  totalGross: number
  totalNet: number
}

export type FranchiseBillingPlResult = {
  expense: FranchiseBillingPlSlice
  revenue: FranchiseBillingPlSlice
  fetched: number
}

export type FranchiseBillingPoRow = {
  id?: number
  status?: string
  cart_json?: unknown
  subtotal?: number | null
  total?: number | null
  created_at?: string | null
  location_name?: string | null
}

const BILLING_KINDS = new Set<string>(['royalty', 'delivery_gp', 'grab_gp', 'all'])
const SPLIT_KINDS = new Set<PoBillingKind>(['royalty', 'delivery_gp', 'grab_gp'])

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function emptyFranchiseBillingKindAmounts(): FranchiseBillingKindAmounts {
  return {
    royaltyGross: 0,
    royaltyNet: 0,
    deliveryGpGross: 0,
    deliveryGpNet: 0,
    grabGpGross: 0,
    grabGpNet: 0,
    combinedGross: 0,
    combinedNet: 0,
  }
}

export function emptyFranchiseBillingPlSlice(): FranchiseBillingPlSlice {
  return { ...emptyFranchiseBillingKindAmounts(), totalGross: 0, totalNet: 0 }
}

export function finalizeFranchiseBillingPlSlice(a: FranchiseBillingKindAmounts): FranchiseBillingPlSlice {
  const totalGross = round2(
    a.royaltyGross + a.deliveryGpGross + a.grabGpGross + a.combinedGross
  )
  const totalNet = round2(a.royaltyNet + a.deliveryGpNet + a.grabGpNet + a.combinedNet)
  return {
    royaltyGross: round2(a.royaltyGross),
    royaltyNet: round2(a.royaltyNet),
    deliveryGpGross: round2(a.deliveryGpGross),
    deliveryGpNet: round2(a.deliveryGpNet),
    grabGpGross: round2(a.grabGpGross),
    grabGpNet: round2(a.grabGpNet),
    combinedGross: round2(a.combinedGross),
    combinedNet: round2(a.combinedNet),
    totalGross,
    totalNet,
  }
}

function addKindAmount(
  target: FranchiseBillingKindAmounts,
  kind: PoBillingKind | 'unknown',
  gross: number,
  net: number
): void {
  if (gross <= 0 && net <= 0) return
  if (kind === 'royalty') {
    target.royaltyGross += gross
    target.royaltyNet += net
  } else if (kind === 'delivery_gp') {
    target.deliveryGpGross += gross
    target.deliveryGpNet += net
  } else if (kind === 'grab_gp') {
    target.grabGpGross += gross
    target.grabGpNet += net
  } else {
    target.combinedGross += gross
    target.combinedNet += net
  }
}

/** 라인명으로 청구 유형 추정 — Grab을 배달보다 먼저 */
export function classifyFranchiseBillingLineName(name: string): PoBillingKind | 'unknown' {
  const n = String(name || '')
    .trim()
    .toLowerCase()
  if (!n) return 'unknown'
  if (n.includes('grab')) return 'grab_gp'
  if (n.includes('delivery') || n.includes('배달')) return 'delivery_gp'
  if (n.includes('royalt') || n.includes('로열') || n.includes('로얄')) return 'royalty'
  return 'unknown'
}

function lineNetAmount(line: PoCartLine): number {
  const price = Number(line.price ?? (line as { cost?: number }).cost ?? 0)
  const qty = Number(line.qty || 0)
  return Math.max(0, round2(price * qty))
}

function lineStoredBillingKind(line: PoCartLine): PoBillingKind | null {
  const raw = String(
    (line as { billingKind?: string }).billingKind ??
      (line as { poBillingKind?: string }).poBillingKind ??
      ''
  ).trim()
  if (SPLIT_KINDS.has(raw as PoBillingKind)) return raw as PoBillingKind
  return null
}

/**
 * PO 헤더 금액(total/subtotal)을 kind별 net/gross로 배분.
 * - billingKind가 royalty|delivery_gp|grab_gp 이고 라인이 단일 유형이면 헤더 전액
 * - billingKind=all 이거나 라인 유형이 섞이면 라인명·라인 billingKind로 분해 후 VAT 비율 배분
 */
export function amountsByKindFromFranchisePo(po: FranchiseBillingPoRow): FranchiseBillingKindAmounts {
  const out = emptyFranchiseBillingKindAmounts()
  const headerKind = parseFranchiseBillingKind(po.cart_json)
  if (!headerKind) return out

  const headerGross = Math.max(0, round2(Number(po.total) || 0))
  const headerNet = Math.max(0, round2(Number(po.subtotal) || 0))
  if (headerGross <= 0 && headerNet <= 0) return out

  const { items } = parsePurchaseOrderCart(po.cart_json)
  const classified: { kind: PoBillingKind | 'unknown'; net: number }[] = []
  for (const line of items) {
    const net = lineNetAmount(line)
    if (net <= 0) continue
    const fromField = lineStoredBillingKind(line)
    const kind = fromField ?? classifyFranchiseBillingLineName(String(line.name || ''))
    classified.push({ kind, net })
  }

  const splitKindsPresent = new Set(
    classified.map((c) => c.kind).filter((k): k is PoBillingKind => SPLIT_KINDS.has(k as PoBillingKind))
  )
  const shouldSplit = headerKind === 'all' || splitKindsPresent.size > 1

  if (!shouldSplit && SPLIT_KINDS.has(headerKind)) {
    addKindAmount(out, headerKind, headerGross, headerNet)
    return out
  }

  if (classified.length === 0) {
    addKindAmount(out, headerKind === 'all' ? 'all' : headerKind, headerGross, headerNet)
    return out
  }

  const netByKind = emptyFranchiseBillingKindAmounts()
  for (const row of classified) {
    addKindAmount(netByKind, row.kind, 0, row.net)
  }
  const parts: { kind: PoBillingKind | 'unknown'; net: number }[] = [
    { kind: 'royalty', net: netByKind.royaltyNet },
    { kind: 'delivery_gp', net: netByKind.deliveryGpNet },
    { kind: 'grab_gp', net: netByKind.grabGpNet },
    { kind: 'all', net: netByKind.combinedNet },
  ]
  const sumNet = round2(parts.reduce((s, p) => s + p.net, 0))
  const scaleBase = headerNet > 0 ? headerNet : sumNet
  if (scaleBase <= 0) {
    addKindAmount(out, headerKind === 'all' ? 'all' : headerKind, headerGross, headerNet)
    return out
  }

  let allocatedGross = 0
  const withNet = parts.filter((p) => p.net > 0)
  withNet.forEach((p, idx) => {
    const isLast = idx === withNet.length - 1
    const gross = isLast
      ? round2(headerGross - allocatedGross)
      : round2(headerGross * (p.net / scaleBase))
    allocatedGross = round2(allocatedGross + gross)
    addKindAmount(out, p.kind, gross, p.net)
  })

  const usedNet = round2(out.royaltyNet + out.deliveryGpNet + out.grabGpNet + out.combinedNet)
  const usedGross = round2(out.royaltyGross + out.deliveryGpGross + out.grabGpGross + out.combinedGross)
  const netGap = round2(headerNet - usedNet)
  const grossGap = round2(headerGross - usedGross)
  if (netGap > 0 || grossGap > 0) {
    addKindAmount(out, 'all', Math.max(0, grossGap), Math.max(0, netGap))
  }
  return out
}

/** 귀속월이 있으면 그 월만; 없으면 orderDate / created_at(방콕)이 기간 내 */
export function franchiseBillingPoInPeriod(
  po: FranchiseBillingPoRow,
  yearMonth: string,
  startStr: string,
  endStr: string
): boolean {
  const { meta } = parsePurchaseOrderCart(po.cart_json)
  const ym = String(meta?.billingMonthYm ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(ym)) {
    return ym === yearMonth
  }
  const orderDate = purchaseOrderMetaOrderDate(po.cart_json)
  if (orderDate) {
    return orderDate >= startStr && orderDate <= endStr
  }
  const created = String(po.created_at ?? '').trim()
  if (!created || Number.isNaN(Date.parse(created))) return false
  const bangkokYmd = new Date(created).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  return bangkokYmd >= startStr && bangkokYmd <= endStr
}

export function parseFranchiseBillingKind(cartJson: unknown): PoBillingKind | null {
  const { meta } = parsePurchaseOrderCart(cartJson)
  const k = String(meta?.billingKind ?? '').trim() as PoBillingKind
  if (!BILLING_KINDS.has(k)) return null
  return k
}

function mergeKindAmounts(target: FranchiseBillingKindAmounts, src: FranchiseBillingKindAmounts): void {
  target.royaltyGross += src.royaltyGross
  target.royaltyNet += src.royaltyNet
  target.deliveryGpGross += src.deliveryGpGross
  target.deliveryGpNet += src.deliveryGpNet
  target.grabGpGross += src.grabGpGross
  target.grabGpNet += src.grabGpNet
  target.combinedGross += src.combinedGross
  target.combinedNet += src.combinedNet
}

/** 순수 집계 — 매칭 콜백으로 비용/매출 귀속 결정 */
export function accumulateFranchiseBillingFromPos(
  rows: FranchiseBillingPoRow[],
  params: {
    yearMonth: string
    startStr: string
    endStr: string
    matchExpense: (relatedStore: string) => boolean
    matchRevenue: (issuerStore: string | null) => boolean
  }
): FranchiseBillingPlResult {
  const expense = emptyFranchiseBillingKindAmounts()
  const revenue = emptyFranchiseBillingKindAmounts()
  let fetched = 0

  for (const po of rows) {
    if (String(po.status || '').trim() !== 'Approved') continue
    if (!isAccountingPurchaseOrderByCartJson(po.cart_json)) continue
    const kind = parseFranchiseBillingKind(po.cart_json)
    if (!kind) continue
    if (!franchiseBillingPoInPeriod(po, params.yearMonth, params.startStr, params.endStr)) continue

    const byKind = amountsByKindFromFranchisePo(po)
    const slice = finalizeFranchiseBillingPlSlice(byKind)
    if (slice.totalGross <= 0 && slice.totalNet <= 0) continue
    fetched += 1

    const relatedStore = resolveAccountingPoReceivableStoreName({
      cart_json: po.cart_json,
      location_name: po.location_name ?? undefined,
    })
    const issuerStore = resolveAccountingPoIssuerStore({ cart_json: po.cart_json })

    if (relatedStore && params.matchExpense(relatedStore)) {
      mergeKindAmounts(expense, byKind)
    }
    if (params.matchRevenue(issuerStore)) {
      mergeKindAmounts(revenue, byKind)
    }
  }

  return {
    expense: finalizeFranchiseBillingPlSlice(expense),
    revenue: finalizeFranchiseBillingPlSlice(revenue),
    fetched,
  }
}

function shiftYmdMonths(ymd: string, deltaMonths: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10))
  if (!y || !m || !d) return ymd
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, d))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Approved 회계 청구 PO를 로드해 손익용 비용(relatedStore)·매출(issuer)로 나눈다.
 * issuerStore 비어 있으면 본사 매출.
 * created_at 윈도우는 넓게(±14개월) — billingMonthYm 귀속과 생성일이 어긋나도 누락 방지.
 */
export async function loadFranchiseBillingForIncomeStatement(params: {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<FranchiseBillingPlResult> {
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = params
  const windowStart = shiftYmdMonths(startStr, -14)
  const windowEnd = shiftYmdMonths(endStr, 2)
  const filter = [
    'status=eq.Approved',
    `created_at=gte.${encodeURIComponent(`${windowStart}T00:00:00+07:00`)}`,
    `created_at=lte.${encodeURIComponent(`${windowEnd}T23:59:59.999+07:00`)}`,
  ].join('&')

  let rows: FranchiseBillingPoRow[] = []
  try {
    rows = ((await supabaseSelectFilterAllPages('purchase_orders', filter, {
      select: 'id,status,cart_json,subtotal,total,created_at,location_name',
      order: 'id.asc',
      maxRows: 1_000_000,
    })) || []) as FranchiseBillingPoRow[]
  } catch {
    return { expense: emptyFranchiseBillingPlSlice(), revenue: emptyFranchiseBillingPlSlice(), fetched: 0 }
  }

  const index = await ensureErpStoreMatchIndex()
  const matchStore = (storeValue: string) =>
    storeMatchesIncomeFilterWithIndex(storeValue, storeFilter, index)

  return accumulateFranchiseBillingFromPos(rows, {
    yearMonth,
    startStr,
    endStr,
    matchExpense: (relatedStore) => {
      if (!relatedStore) return false
      if (isHQ) return isHqIssuerOrRelated(relatedStore)
      return matchStore(relatedStore)
    },
    matchRevenue: (issuerStore) => {
      if (issuerStore == null || !String(issuerStore).trim()) {
        return isHQ
      }
      if (isHQ) return isHqIssuerOrRelated(issuerStore)
      return matchStore(issuerStore)
    },
  })
}
