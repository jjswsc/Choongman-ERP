/**
 * PO 매장 청구(로얄티·배달 GP·Grab) — POS 매출 스냅샷 집계 및 초안 라인 생성
 */
import { resolveOrderDeliveryAppCode } from '@/lib/pos-delivery-order-meta'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'

const COMPLETED = new Set(['completed', 'paid', 'ready'])

export type PoBillingOrderRow = {
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
      if (isGrabDeliveryPlatformCode(resolveOrderDeliveryAppCode(r))) grabSales += amt
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
