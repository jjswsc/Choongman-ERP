/**
 * 승인된 회계 PO(로열티·배달 GP·Grab GP) → 손익 전기 집계.
 * VAT 포함 = purchase_orders.total, VAT 제외 = subtotal (원천세는 P&L에서 차감하지 않음).
 */
import {
  isAccountingPurchaseOrderByCartJson,
  parsePurchaseOrderCart,
  purchaseOrderMetaOrderDate,
  resolveAccountingPoIssuerStore,
  resolveAccountingPoReceivableStoreName,
  type PoBillingKind,
} from '@/lib/purchase-order-cart'
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
  /** billingKind === 'all' */
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
  kind: PoBillingKind,
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

    fetched += 1
    const gross = Math.max(0, round2(Number(po.total) || 0))
    const net = Math.max(0, round2(Number(po.subtotal) || 0))
    if (gross <= 0 && net <= 0) continue

    const relatedStore = resolveAccountingPoReceivableStoreName({
      cart_json: po.cart_json,
      location_name: po.location_name ?? undefined,
    })
    const issuerStore = resolveAccountingPoIssuerStore({ cart_json: po.cart_json })

    if (relatedStore && params.matchExpense(relatedStore)) {
      addKindAmount(expense, kind, gross, net)
    }
    if (params.matchRevenue(issuerStore)) {
      addKindAmount(revenue, kind, gross, net)
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
 */
export async function loadFranchiseBillingForIncomeStatement(params: {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<FranchiseBillingPlResult> {
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = params
  const windowStart = shiftYmdMonths(startStr, -2)
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

export const PL_FRANCHISE_BILLING_SALES_KEY = '__pl_franchise_billing__'
