/**
 * 입고 배치 ↔ 미지급(Inbound) 금액·일자 — 입고 내역 조회(공급가+줄별 VAT 합)과 동일 기준
 */
import { getBangkokStartOfDayUtcIso, getBangkokTodayDateString } from './bangkok-time'
import { roundErp3 } from './utils'
import { isItemVatExempt, normalizeItemTaxType, type ItemTaxType } from './income-statement-item-vat'
import { roundMoney2 } from './invoice-vat-total'

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

/**
 * 입고 화면(getInboundHistory)과 동일:
 * 줄 공급가 = roundErp3(qty×단가), 줄 VAT = round2(공급가×7%), 배치 합 = 줄 합.
 * 배치 과세총액에 한 번만 7%를 적용하면 입고 화면 합계와 1~수 삿(฿) 어긋날 수 있음.
 */
export function computeInboundBatchAmounts(
  lines: InboundPayableLine[],
  taxByCode: ReadonlyMap<string, ItemTaxType>
): { netTotal: number; grossTotal: number; vatTotal: number; batchDateYmd: string } {
  let netTotal = 0
  let vatTotal = 0
  let batchDateYmd = ''
  for (const line of lines) {
    const code = String(line.code || '').trim()
    const qty = Math.max(0, Number(line.qty) || 0)
    const unit = Math.max(0, Number(line.unitCost) || 0)
    if (!code || qty <= 0) continue
    const net = roundErp3(qty * unit)
    const taxType = taxByCode.get(code) ?? 'taxable'
    const rate = isItemVatExempt(taxType) ? 0 : 0.07
    const vat = roundMoney2(net * rate)
    netTotal = roundMoney2(netTotal + net)
    vatTotal = roundMoney2(vatTotal + vat)
    const ymd = line.dateYmd ? parseInboundDateBangkokYmd(line.dateYmd) : ''
    if (ymd && (!batchDateYmd || ymd > batchDateYmd)) batchDateYmd = ymd
  }
  if (!batchDateYmd) batchDateYmd = getBangkokTodayDateString()
  const grossTotal = roundMoney2(netTotal + vatTotal)
  return { netTotal, grossTotal, vatTotal, batchDateYmd }
}

/**
 * ใบกำกับภาษีซื้อ / PP.30 매입: 과세 품목만 มูลค่า·VAT.
 * 면세·영세율은 มูลค่า에서 제외 (Freshket 혼합 인보이스와 동일).
 */
export function computeInboundBatchTaxableAmounts(
  lines: InboundPayableLine[],
  taxByCode: ReadonlyMap<string, ItemTaxType>
): {
  taxableNet: number
  vatTotal: number
  taxableGross: number
  exemptNet: number
  batchDateYmd: string
} {
  let taxableNet = 0
  let vatTotal = 0
  let exemptNet = 0
  let batchDateYmd = ''
  for (const line of lines) {
    const code = String(line.code || '').trim()
    const qty = Math.max(0, Number(line.qty) || 0)
    const unit = Math.max(0, Number(line.unitCost) || 0)
    if (!code || qty <= 0) continue
    const net = roundErp3(qty * unit)
    const taxType = taxByCode.get(code) ?? 'taxable'
    if (isItemVatExempt(taxType)) {
      exemptNet = roundMoney2(exemptNet + net)
    } else {
      const vat = roundMoney2(net * 0.07)
      taxableNet = roundMoney2(taxableNet + net)
      vatTotal = roundMoney2(vatTotal + vat)
    }
    const ymd = line.dateYmd ? parseInboundDateBangkokYmd(line.dateYmd) : ''
    if (ymd && (!batchDateYmd || ymd > batchDateYmd)) batchDateYmd = ymd
  }
  if (!batchDateYmd) batchDateYmd = getBangkokTodayDateString()
  const taxableGross = roundMoney2(taxableNet + vatTotal)
  return { taxableNet, vatTotal, taxableGross, exemptNet, batchDateYmd }
}
