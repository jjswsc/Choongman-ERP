import { formatDateBangkok } from '@/lib/outbound-order-line-match'
import { hqOutboundIncomeDedupeKey } from '@/lib/hq-outbound-income-total'

export function fingerprintHqOutboundStockLogRow(params: {
  orderId: number
  itemCode: string
  qtyAbs: number
  logDateYmd: string
  unitPrice: number
}): string {
  const key = hqOutboundIncomeDedupeKey({
    orderId: params.orderId,
    itemCode: params.itemCode,
    qty: params.qtyAbs,
    logDate: params.logDateYmd,
    unitPrice: params.unitPrice,
  })
  return key || `${params.orderId}|${params.itemCode}|${params.qtyAbs}|${params.logDateYmd}|${params.unitPrice}`
}

type ExistingOutboundRow = {
  item_code?: string
  qty?: number
  log_date?: string
  invoice_unit_price?: number | string | null
}

export function fingerprintsFromExistingOutboundLogs(
  orderId: number,
  rows: ExistingOutboundRow[]
): Set<string> {
  const out = new Set<string>()
  for (const row of rows || []) {
    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || qtyAbs <= 0) continue
    const d = new Date(row.log_date || '')
    if (Number.isNaN(d.getTime())) continue
    const unitPrice = Number(row.invoice_unit_price) || 0
    out.add(
      fingerprintHqOutboundStockLogRow({
        orderId,
        itemCode: code,
        qtyAbs,
        logDateYmd: formatDateBangkok(d),
        unitPrice,
      })
    )
  }
  return out
}

export function filterNewHqOutboundRows<T extends {
  item_code?: string
  qty?: number
  invoice_unit_price?: number | string | null
}>(
  orderId: number,
  logDateYmd: string,
  rows: T[],
  existingFingerprints: Set<string>
): T[] {
  const seen = new Set(existingFingerprints)
  const out: T[] = []
  for (const row of rows) {
    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || qtyAbs <= 0) continue
    const unitPrice = Number(row.invoice_unit_price) || 0
    const fp = fingerprintHqOutboundStockLogRow({
      orderId,
      itemCode: code,
      qtyAbs,
      logDateYmd,
      unitPrice,
    })
    if (seen.has(fp)) continue
    seen.add(fp)
    out.push(row)
  }
  return out
}

type ExistingInboundRow = {
  item_code?: string
  qty?: number
  log_date?: string
  vendor_target?: string | null
  location?: string | null
}

export function fingerprintStoreInboundFromHqRow(params: {
  storeLocation: string
  itemCode: string
  qtyAbs: number
  logDateYmd: string
}): string {
  return `${params.storeLocation}|${params.itemCode}|${params.qtyAbs}|${params.logDateYmd}|From HQ`
}

export function fingerprintsFromExistingInboundLogs(
  storeLocation: string,
  logDateYmd: string,
  rows: ExistingInboundRow[]
): Set<string> {
  const store = String(storeLocation || '').trim()
  const out = new Set<string>()
  for (const row of rows || []) {
    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || qtyAbs <= 0) continue
    const vendor = String(row.vendor_target || '').trim()
    if (vendor !== 'From HQ') continue
    const loc = String(row.location || '').trim()
    if (store && loc && loc.toLowerCase() !== store.toLowerCase()) continue
    const d = new Date(row.log_date || '')
    const ymd = Number.isNaN(d.getTime()) ? logDateYmd : formatDateBangkok(d)
    if (ymd !== logDateYmd) continue
    out.add(
      fingerprintStoreInboundFromHqRow({
        storeLocation: store || loc,
        itemCode: code,
        qtyAbs,
        logDateYmd: ymd,
      })
    )
  }
  return out
}

export function filterNewInboundFromHqRows<T extends {
  location?: string
  item_code?: string
  qty?: number
  vendor_target?: string
}>(
  storeLocation: string,
  logDateYmd: string,
  rows: T[],
  existingFingerprints: Set<string>
): T[] {
  const store = String(storeLocation || '').trim()
  const seen = new Set(existingFingerprints)
  const out: T[] = []
  for (const row of rows) {
    const code = String(row.item_code || '').trim()
    const qtyAbs = Math.abs(Number(row.qty) || 0)
    if (!code || qtyAbs <= 0) continue
    const fp = fingerprintStoreInboundFromHqRow({
      storeLocation: store || String(row.location || '').trim(),
      itemCode: code,
      qtyAbs,
      logDateYmd,
    })
    if (seen.has(fp)) continue
    seen.add(fp)
    out.push(row)
  }
  return out
}
