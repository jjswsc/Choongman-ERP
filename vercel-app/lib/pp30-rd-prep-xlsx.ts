/**
 * ภ.พ.30 RD Prep 검수용 엑셀 (신고 TXT 대체 아님 — 내부 검토용)
 */
import { utils, type WorkBook } from 'xlsx'
import type { VatLedgerRow } from '@/lib/vat-ledger-csv'
import type { Pp30RdPrepTxtOptions } from '@/lib/pp30-rd-prep-txt'
import { buildRdFilingTxtFilename, rdDigitsOnly } from '@/lib/rd-filing-common'
import { applyErpDownloadFontToWorkbook } from '@/lib/erp-excel-export'

function sortRows(rows: VatLedgerRow[]): VatLedgerRow[] {
  return [...rows].sort((a, b) => {
    const da = String(a.doc_date || '')
    const db = String(b.doc_date || '')
    if (da !== db) return da.localeCompare(db)
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

function detailSheetRows(direction: 'output' | 'input', rows: VatLedgerRow[]): (string | number)[][] {
  const header = [
    'seq',
    'direction',
    'doc_date',
    'invoice_number',
    'counterparty_name',
    'counterparty_tax_id',
    'net_amount',
    'vat_amount',
    'total_amount',
    'vat_status',
    'store_name',
    'filing_status',
    'memo',
  ]
  const body = sortRows(rows).map((r, i) => [
    i + 1,
    direction === 'output' ? 'S(매출)' : 'P(매입)',
    String(r.doc_date || ''),
    String(r.invoice_number || ''),
    String(r.counterparty_name || ''),
    rdDigitsOnly(r.counterparty_tax_id).slice(0, 13),
    Number(r.net_amount) || 0,
    Number(r.vat_amount) || 0,
    Number(r.total_amount) || 0,
    String(r.vat_status || ''),
    String(r.store_name || ''),
    String(r.filing_status || ''),
    String(r.memo || ''),
  ])
  return [header, ...body]
}

export function buildPp30RdPrepReviewWorkbook(
  outputRows: VatLedgerRow[],
  inputRows: VatLedgerRow[],
  opts: Pp30RdPrepTxtOptions
): WorkBook {
  const payable = (Number(opts.outputVat) || 0) - (Number(opts.inputVat) || 0)
  const summary: (string | number)[][] = [
    ['항목', '값'],
    ['서식', 'PP30'],
    ['용도', '검수용(엑셀) — 국세청 업로드는 RD Prep TXT 사용'],
    ['신고월(CE)', opts.taxMonth],
    ['납세자명', String(opts.payerName || '')],
    ['납세자번호(13)', rdDigitsOnly(opts.payerTaxId).slice(0, 13)],
    ['지점코드', rdDigitsOnly(opts.payerBranchNo).padStart(6, '0').slice(-6) || '000000'],
    ['사업장소', String(opts.placeOfBusiness || '')],
    ['매출 순금액', Number(opts.outputNet) || 0],
    ['매출 VAT', Number(opts.outputVat) || 0],
    ['매입 순금액', Number(opts.inputNet) || 0],
    ['매입 VAT', Number(opts.inputVat) || 0],
    ['납부 VAT', payable > 0 ? payable : 0],
    ['환급/이월 VAT', payable < 0 ? Math.abs(payable) : 0],
    ['매출 행수', sortRows(outputRows).length],
    ['매입 행수', sortRows(inputRows).length],
  ]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.aoa_to_sheet(summary), 'Summary')
  utils.book_append_sheet(wb, utils.aoa_to_sheet(detailSheetRows('output', outputRows)), 'Sales')
  utils.book_append_sheet(wb, utils.aoa_to_sheet(detailSheetRows('input', inputRows)), 'Purchase')
  applyErpDownloadFontToWorkbook(wb)
  return wb
}

export function buildPp30RdPrepXlsxFilename(params: {
  taxId13: string
  taxMonth: string
  branchNo6?: string
}): string {
  const base = buildRdFilingTxtFilename({
    taxType: 'PP30',
    taxId13: params.taxId13,
    taxMonth: params.taxMonth,
    branchNo6: params.branchNo6,
  })
  return base.replace(/\.txt$/i, '_review.xlsx')
}
