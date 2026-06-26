/**
 * 입고 배치 ↔ 미지급(Inbound) 금액·일자 — 입고 화면(공급가+VAT 합계)과 동일 기준
 */
import { getBangkokStartOfDayUtcIso, getBangkokTodayDateString } from './bangkok-time'
import { roundErp3 } from './utils'
import {
  accumulateNetByItemTax,
  emptyNetVatBuckets,
  grossFromNetVatBuckets,
  netTotalFromBuckets,
  normalizeItemTaxType,
  type ItemTaxType,
} from './income-statement-item-vat'

export type InboundPayableLine = {
  code: string
  qty: number
  unitCost: number
  dateYmd?: string
}

export function parseInboundDateBangkokYmd(raw: string | null | undefined, fallback?: string): string {
  const s = String(raw || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return fallback || getBangkokTodayDateString()
}

/** stock_logs.log_date 등 → 방콕 YYYY-MM-DD (입고 내역·미지급 표시 통일) */
export function formatStockLogDateBangkokYmd(logDateRaw: string | null | undefined): string {
  const v = String(logDateRaw || '').trim()
  if (!v) return ''
  const d = new Date(v.includes('T') ? v : `${v.slice(0, 10)}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return v.slice(0, 10)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export function inboundLogDateIsoFromBangkokYmd(ymd: string): string {
  return getBangkokStartOfDayUtcIso(parseInboundDateBangkokYmd(ymd))
}

export function buildItemTaxMapFromRows(
  rows: { code?: string; tax?: string | null }[] | null | undefined
): Map<string, ItemTaxType> {
  const map = new Map<string, ItemTaxType>()
  for (const row of rows || []) {
    const code = String(row.code || '').trim()
    if (!code) continue
    map.set(code, normalizeItemTaxType(row.tax))
  }
  return map
}

export function computeInboundBatchAmounts(
  lines: InboundPayableLine[],
  taxByCode: ReadonlyMap<string, ItemTaxType>
): { netTotal: number; grossTotal: number; vatTotal: number; batchDateYmd: string } {
  const buckets = emptyNetVatBuckets()
  let batchDateYmd = ''
  for (const line of lines) {
    const code = String(line.code || '').trim()
    const qty = Math.max(0, Number(line.qty) || 0)
    const unit = Math.max(0, Number(line.unitCost) || 0)
    if (!code || qty <= 0) continue
    const net = roundErp3(qty * unit)
    accumulateNetByItemTax(buckets, code, net, taxByCode)
    const ymd = line.dateYmd ? parseInboundDateBangkokYmd(line.dateYmd) : ''
    if (ymd && (!batchDateYmd || ymd > batchDateYmd)) batchDateYmd = ymd
  }
  if (!batchDateYmd) batchDateYmd = getBangkokTodayDateString()
  const netTotal = netTotalFromBuckets(buckets)
  const grossTotal = grossFromNetVatBuckets(buckets)
  const vatTotal = Math.round((grossTotal - netTotal) * 100) / 100
  return { netTotal, grossTotal, vatTotal, batchDateYmd }
}
