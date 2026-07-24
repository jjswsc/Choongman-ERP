import {
  formatDateBangkok,
  unitPriceFromOutboundLogSnapshot,
  type OrderCartLine,
} from '@/lib/outbound-order-line-match'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStoreVariant } from '@/lib/office-store-canonical'

export type HqStockLogLite = {
  id?: number
  log_type?: string
  log_date?: string | null
  location?: string | null
  vendor_target?: string | null
  item_code?: string | null
  item_name?: string | null
  qty?: number | string | null
  order_id?: number | string | null
  invoice_unit_price?: number | string | null
  unit_cost?: number | string | null
  reference_no?: string | null
}

export type HqOutboundMatch = {
  log: HqStockLogLite
  orderId: number
  storeName: string
  itemCode: string
  docDate: string
  qtyAbs: number
}

export function bangkokYmdFromStockLogDate(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const ms = Date.parse(s)
  if (Number.isFinite(ms)) return formatDateBangkok(new Date(ms))
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : ''
}

export function normalizeHqReferenceNo(raw: unknown): string {
  return String(raw || '').trim().slice(0, 200)
}

export function buildHqOutboundOrderKey(orderId: number, store: string, itemCode: string): string {
  return `${orderId}|${String(store || '').trim()}|${String(itemCode || '').trim()}`
}

export function buildHqOutboundFallbackKey(docDate: string, store: string, itemCode: string, qtyAbs: number): string {
  return `${docDate}|${String(store || '').trim()}|${String(itemCode || '').trim()}|${qtyAbs}`
}

export function buildHqOutboundIndexes(logs: HqStockLogLite[]): {
  byOrderKey: Map<string, HqOutboundMatch>
  byFallbackKey: Map<string, HqOutboundMatch[]>
} {
  const byOrderKey = new Map<string, HqOutboundMatch>()
  const byFallbackKey = new Map<string, HqOutboundMatch[]>()

  for (const log of logs || []) {
    const logType = String(log.log_type || '').trim()
    if (logType !== 'Outbound' && logType !== 'ForceOutbound') continue
    const hqLoc = String(log.location || '').trim()
    if (!(hqLoc === '본사' || isHeadOfficeLikeStoreName(hqLoc) || isOfficeStoreVariant(hqLoc))) continue
    const storeName = String(log.vendor_target || '').trim()
    const itemCode = String(log.item_code || '').trim()
    if (!storeName || !itemCode) continue
    const docDate = bangkokYmdFromStockLogDate(log.log_date)
    const qtyAbs = Math.abs(Number(log.qty) || 0)
    if (!docDate || qtyAbs <= 0) continue

    const entry: HqOutboundMatch = {
      log,
      orderId: Math.floor(Number(log.order_id) || 0),
      storeName,
      itemCode,
      docDate,
      qtyAbs,
    }

    if (entry.orderId > 0) {
      const ok = buildHqOutboundOrderKey(entry.orderId, storeName, itemCode)
      if (!byOrderKey.has(ok)) byOrderKey.set(ok, entry)
    }
    const fk = buildHqOutboundFallbackKey(docDate, storeName, itemCode, qtyAbs)
    const bucket = byFallbackKey.get(fk) || []
    bucket.push(entry)
    byFallbackKey.set(fk, bucket)
  }

  return { byOrderKey, byFallbackKey }
}

function pickBestOutboundMatch(candidates: HqOutboundMatch[]): HqOutboundMatch | null {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]!
  const withRef = candidates.find((c) => normalizeHqReferenceNo(c.log.reference_no))
  if (withRef) return withRef
  const withOrder = candidates.find((c) => c.orderId > 0)
  if (withOrder) return withOrder
  return candidates[candidates.length - 1]!
}

/** 매장 Inbound(From HQ) ↔ 본사 Outbound/ForceOutbound 짝 */
export function findHqOutboundMatchForStoreInbound(
  inbound: HqStockLogLite,
  indexes: { byOrderKey: Map<string, HqOutboundMatch>; byFallbackKey: Map<string, HqOutboundMatch[]> }
): HqOutboundMatch | null {
  const storeName = String(inbound.location || '').trim()
  const itemCode = String(inbound.item_code || '').trim()
  const docDate = bangkokYmdFromStockLogDate(inbound.log_date)
  const qtyAbs = Math.abs(Number(inbound.qty) || 0)
  if (!storeName || !itemCode || !docDate || qtyAbs <= 0) return null

  const inboundOrderId = Math.floor(Number(inbound.order_id) || 0)
  if (inboundOrderId > 0) {
    const hit = indexes.byOrderKey.get(buildHqOutboundOrderKey(inboundOrderId, storeName, itemCode))
    if (hit) return hit
  }

  const fk = buildHqOutboundFallbackKey(docDate, storeName, itemCode, qtyAbs)
  const fromFallback = pickBestOutboundMatch(indexes.byFallbackKey.get(fk) || [])
  if (fromFallback) return fromFallback

  return null
}

/** 출고 관리·인보이스 번호(IV… / IVF… / reference_no)와 동일 규칙 */
export function hqIssuedInvoiceNumberForStoreInput(params: {
  inbound: HqStockLogLite
  logType: string
  hqMatch: HqOutboundMatch | null
}): string {
  const logType = String(params.logType || '').trim()
  if (logType === 'ForcePush') {
    const onLog = normalizeHqReferenceNo(params.inbound.reference_no)
    if (onLog) return onLog
  }

  const match = params.hqMatch
  if (!match) return ''

  const ref = normalizeHqReferenceNo(match.log.reference_no)
  if (ref) return ref

  const datePart = bangkokYmdFromStockLogDate(match.log.log_date).replace(/\D/g, '').slice(0, 8)
  if (match.orderId > 0 && datePart.length >= 8) {
    return `IV${datePart}-${match.orderId}`
  }

  const stockLogId = Math.floor(Number(match.log.id) || 0)
  if (stockLogId > 0 && datePart.length >= 8) {
    return `IVF${datePart}-${stockLogId}`
  }

  return ''
}

/** PP30 매입(input) 단가 — 출고 관리(getCombinedOutboundHistory)와 동일 */
export function unitPriceForStoreHqInputLog(params: {
  inbound: HqStockLogLite
  logType: string
  hqMatch: HqOutboundMatch | null
  orderCartById: Record<string, OrderCartLine[] | undefined>
  masterPrice: number
  masterCost: number
}): number {
  const logType = String(params.logType || '').trim()
  const code = String(params.inbound.item_code || '').trim()
  const itemName = String(params.inbound.item_name || '').trim()

  if (params.hqMatch) {
    const cart =
      params.hqMatch.orderId > 0 ? params.orderCartById[String(params.hqMatch.orderId)] : undefined
    const fromOutbound = unitPriceFromOutboundLogSnapshot(
      params.hqMatch.log,
      cart,
      code,
      itemName,
      params.masterPrice
    )
    if (Number(fromOutbound) > 0) return Number(fromOutbound)
  }

  if (Number(params.inbound.invoice_unit_price) > 0) return Number(params.inbound.invoice_unit_price)
  if (Number(params.inbound.unit_cost) > 0) return Number(params.inbound.unit_cost)

  if (logType === 'ForcePush') return params.masterCost > 0 ? params.masterCost : params.masterPrice
  return params.masterCost > 0 ? params.masterCost : params.masterPrice
}
