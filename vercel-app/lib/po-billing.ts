/**
 * PO 매장 청구(로얄티·배달 GP·Grab) — POS 매출 스냅샷 집계 및 초안 라인 생성
 * 기간·합계는 매출 관리(posSalesByDeliveryApp 등)와 동일한 영업일·total 기준.
 */
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import {
  resolvePosBusinessHoursFromContext,
  type PosBusinessDaySettingsContext,
} from '@/lib/pos-business-day-server'
import {
  billingPctsEqual,
  resolvePoBillingRateForDate,
  type PoBillingRateVersionRow,
} from '@/lib/po-billing-rate-versions'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'

/** getPoBillingDraft fetch select — 영업일 필터용 created_at 포함 */
export const PO_BILLING_ORDER_ROW_SELECT =
  'created_at,store_code,status,order_type,total,delivery_app_code'

const COMPLETED = new Set(['completed', 'paid', 'ready'])

export type PoBillingOrderRow = {
  created_at?: string | null
  order_type?: string
  total?: number
  status?: string
  store_code?: string
  delivery_app_code?: string | null
  delivery_payment_channel?: string | null
  items_json?: string | null
}

export type PoBillingSalesSnapshot = {
  totalSales: number
  deliverySales: number
  grabSales: number
}

export type PoBillingSettingRow = {
  store_name: string
  royalty_pct: number
  delivery_gp_pct: number
  grab_gp_pct: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
}

export type PoBillingDraftLine = {
  code: string
  name: string
  price: number
  qty: number
  taxType: 'taxable'
}

/** all: 로얄티·배달 GP·Grab GP 전부 (기존 동작) */
export type PoBillingDraftMode = 'all' | 'royalty' | 'delivery_gp' | 'grab_gp'

export function isGrabDeliveryPlatformCode(code: string): boolean {
  const c = String(code || '')
    .trim()
    .toLowerCase()
  return c.includes('grab')
}

/** 매출 관리 RPC delivery_platform 과 동일 — delivery_app_code 컬럼만 */
function grabPlatformCodeForPoBilling(row: PoBillingOrderRow): string {
  return String(row.delivery_app_code ?? '').trim().toLowerCase()
}

/** store 필터는 쿼리 단계에서 적용된 행만 넘긴다고 가정 */
export function aggregatePoBillingSales(rows: PoBillingOrderRow[]): PoBillingSalesSnapshot {
  let totalSales = 0
  let deliverySales = 0
  let grabSales = 0
  for (const r of rows) {
    const st = String(r.status ?? '')
      .trim()
      .toLowerCase()
    if (!COMPLETED.has(st)) continue
    const amt = Number(r.total) || 0
    totalSales += amt
    const k = normalizePosOrderTypeKey(r.order_type)
    if (k === 'delivery') {
      deliverySales += amt
      if (isGrabDeliveryPlatformCode(grabPlatformCodeForPoBilling(r))) grabSales += amt
    }
  }
  return { totalSales, deliverySales, grabSales }
}

function roundMoney(n: number): number {
  return Math.max(0, Math.floor(n * 100 + 1e-9) / 100)
}

export function buildPoBillingDraftLines(
  settings: PoBillingSettingRow,
  snap: PoBillingSalesSnapshot,
  periodLabel: string,
  defaultLabels: { royalty: string; deliveryGp: string; grabGp: string },
  mode: PoBillingDraftMode = 'all'
): PoBillingDraftLine[] {
  const lines: PoBillingDraftLine[] = []
  const uid = () => `PO-BIL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const suffix = periodLabel ? ` (${periodLabel})` : ''

  const wantRoyalty = mode === 'all' || mode === 'royalty'
  const wantDelivery = mode === 'all' || mode === 'delivery_gp'
  const wantGrab = mode === 'all' || mode === 'grab_gp'

  const rPct = Math.min(100, Math.max(0, Number(settings.royalty_pct) || 0))
  if (wantRoyalty && rPct > 0) {
    const amt = roundMoney((snap.totalSales * rPct) / 100)
    if (amt > 0) {
      lines.push({
        code: uid(),
        name: `${(settings.label_royalty || defaultLabels.royalty).trim()}${suffix}`,
        price: amt,
        qty: 1,
        taxType: 'taxable',
      })
    }
  }

  const dPct = Math.min(100, Math.max(0, Number(settings.delivery_gp_pct) || 0))
  if (wantDelivery && dPct > 0) {
    const amt = roundMoney((snap.deliverySales * dPct) / 100)
    if (amt > 0) {
      lines.push({
        code: uid(),
        name: `${(settings.label_delivery_gp || defaultLabels.deliveryGp).trim()}${suffix}`,
        price: amt,
        qty: 1,
        taxType: 'taxable',
      })
    }
  }

  const gPct = Math.min(100, Math.max(0, Number(settings.grab_gp_pct) || 0))
  if (wantGrab && gPct > 0) {
    const amt = roundMoney((snap.grabSales * gPct) / 100)
    if (amt > 0) {
      lines.push({
        code: uid(),
        name: `${(settings.label_grab_gp || defaultLabels.grabGp).trim()}${suffix}`,
        price: amt,
        qty: 1,
        taxType: 'taxable',
      })
    }
  }

  return lines
}

export type PoBillingRateSegment = {
  startYmd: string
  endYmd: string
  settings: PoBillingSettingRow
  snap: PoBillingSalesSnapshot
}

function emptySnap(): PoBillingSalesSnapshot {
  return { totalSales: 0, deliverySales: 0, grabSales: 0 }
}

function addSnap(a: PoBillingSalesSnapshot, b: PoBillingSalesSnapshot): PoBillingSalesSnapshot {
  return {
    totalSales: a.totalSales + b.totalSales,
    deliverySales: a.deliverySales + b.deliverySales,
    grabSales: a.grabSales + b.grabSales,
  }
}

function rateKey(s: PoBillingSettingRow): string {
  return `${s.royalty_pct}|${s.delivery_gp_pct}|${s.grab_gp_pct}`
}

/**
 * 주문을 영업일별로 집계한 뒤, 동일 비율이 이어지는 구간으로 압축.
 * versions가 비면 fallbackSettings 단일 구간(하위 호환).
 */
export function buildPoBillingRateSegments(
  rows: PoBillingOrderRow[],
  versions: PoBillingRateVersionRow[],
  bizCtx: PosBusinessDaySettingsContext,
  storeName: string,
  fallbackSettings: PoBillingSettingRow | null
): PoBillingRateSegment[] {
  const byDay = new Map<string, PoBillingSalesSnapshot>()
  for (const r of rows) {
    const st = String(r.status ?? '')
      .trim()
      .toLowerCase()
    if (!COMPLETED.has(st)) continue
    const created = r.created_at
    if (!created) continue
    const hours = resolvePosBusinessHoursFromContext(bizCtx, String(r.store_code ?? storeName).trim())
    const ymd = getPosBusinessDateStrFromConfig(new Date(created), hours)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue
    const prev = byDay.get(ymd) || emptySnap()
    const one = aggregatePoBillingSales([r])
    byDay.set(ymd, addSnap(prev, one))
  }

  const days = [...byDay.keys()].sort()
  if (days.length === 0) return []

  const segments: PoBillingRateSegment[] = []
  let cur: PoBillingRateSegment | null = null

  for (const ymd of days) {
    const snap = byDay.get(ymd) || emptySnap()
    const resolved =
      versions.length > 0
        ? resolvePoBillingRateForDate(versions, ymd, storeName)
        : fallbackSettings
    const settings: PoBillingSettingRow = resolved || {
      store_name: storeName,
      royalty_pct: 0,
      delivery_gp_pct: 0,
      grab_gp_pct: 0,
    }
    if (cur && rateKey(cur.settings) === rateKey(settings)) {
      cur.endYmd = ymd
      cur.snap = addSnap(cur.snap, snap)
      // 라벨은 첫 구간 settings 유지
      continue
    }
    if (cur) segments.push(cur)
    cur = {
      startYmd: ymd,
      endYmd: ymd,
      settings: { ...settings, store_name: storeName },
      snap,
    }
  }
  if (cur) segments.push(cur)
  return segments
}

export function buildPoBillingDraftLinesFromSegments(
  segments: PoBillingRateSegment[],
  defaultLabels: { royalty: string; deliveryGp: string; grabGp: string },
  mode: PoBillingDraftMode = 'all'
): PoBillingDraftLine[] {
  const lines: PoBillingDraftLine[] = []
  for (const seg of segments) {
    const periodLabel =
      seg.startYmd === seg.endYmd ? seg.startYmd : `${seg.startYmd} ~ ${seg.endYmd}`
    lines.push(...buildPoBillingDraftLines(seg.settings, seg.snap, periodLabel, defaultLabels, mode))
  }
  return lines
}

export function sumPoBillingSnapshots(segments: PoBillingRateSegment[]): PoBillingSalesSnapshot {
  return segments.reduce((acc, s) => addSnap(acc, s.snap), emptySnap())
}

export function summarizePoBillingSegmentRates(segments: PoBillingRateSegment[]): {
  royalty_pct: number
  delivery_gp_pct: number
  grab_gp_pct: number
  segments: {
    startYmd: string
    endYmd: string
    royalty_pct: number
    delivery_gp_pct: number
    grab_gp_pct: number
  }[]
} {
  const list = segments.map((s) => ({
    startYmd: s.startYmd,
    endYmd: s.endYmd,
    royalty_pct: s.settings.royalty_pct,
    delivery_gp_pct: s.settings.delivery_gp_pct,
    grab_gp_pct: s.settings.grab_gp_pct,
  }))
  const last = segments[segments.length - 1]?.settings
  return {
    royalty_pct: last?.royalty_pct ?? 0,
    delivery_gp_pct: last?.delivery_gp_pct ?? 0,
    grab_gp_pct: last?.grab_gp_pct ?? 0,
    segments: list,
  }
}

/** 테스트·스킵 비교용 re-export */
export { billingPctsEqual }
