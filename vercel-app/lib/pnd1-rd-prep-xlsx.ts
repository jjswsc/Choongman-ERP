/**
 * ภ.ง.ด.1 검수용 엑셀 (RD Prep TXT와 동일 컬럼 — 내부 검토·엑셀 작업용)
 */
import { utils, type WorkBook } from 'xlsx'
import { applyErpDownloadFontToWorkbook } from '@/lib/erp-excel-export'
import {
  pnd1LedgerToRdPrepTxt,
  type Pnd1RdPrepTxtOptions,
  type Pnd1SourceRow,
} from '@/lib/pnd1-rd-prep-txt'

function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function toChristianDdMmYyyy(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const y = Number(s.slice(0, 4))
  const m = s.slice(5, 7)
  const d = s.slice(8, 10)
  if (!Number.isFinite(y)) return ''
  return `${d}/${m}/${String(y)}`
}

export function buildPnd1RdPrepReviewWorkbook(
  rows: Pnd1SourceRow[],
  opts: Pnd1RdPrepTxtOptions = {}
): WorkBook {
  const payerTaxId = digitsOnly(opts.payerTaxId).slice(0, 13)
  const payerBranchNo = digitsOnly(opts.payerBranchNo).slice(0, 5) || '00000'
  const payerName = String(opts.payerName || '').trim()

  const summary: (string | number)[][] = [
    ['항목', '값'],
    ['payer_tax_id', payerTaxId],
    ['payer_branch_no', payerBranchNo],
    ['payer_name', payerName],
    ['row_count', (rows || []).length],
    ['gross_sum', (rows || []).reduce((s, r) => s + (Number(r.gross_amount) || 0), 0)],
    ['wht_sum', (rows || []).reduce((s, r) => s + (Number(r.wht_amount) || 0), 0)],
  ]

  const detailHeader = [
    'seq',
    'payee_tax_id',
    'payee_name',
    'payee_address',
    'payment_date',
    'payment_date_txt',
    'income_type',
    'wht_rate',
    'gross_amount',
    'withheld_amount',
    'certificate_no',
    'tax_month',
    'store_name',
    'form_hint',
    'memo',
    'payer_tax_id',
    'payer_branch_no',
    'payer_name',
  ]
  const detailBody = (rows || []).map((r, i) => [
    i + 1,
    digitsOnly(r.payee_tax_id).slice(0, 13),
    String(r.payee_name || '').trim(),
    String(r.payee_address || '').trim(),
    String(r.payment_date || '').trim().slice(0, 10),
    toChristianDdMmYyyy(r.payment_date),
    String(r.income_type || '').trim(),
    Number(r.wht_rate) || 0,
    Number(r.gross_amount) || 0,
    Number(r.wht_amount) || 0,
    String(r.certificate_no || '').trim(),
    String(r.tax_month || '').trim(),
    String(r.store_name || '').trim(),
    String((r as { form_hint?: string | null }).form_hint || '').trim(),
    String(r.memo || '').trim(),
    payerTaxId,
    payerBranchNo,
    payerName,
  ])

  const pipePreview = pnd1LedgerToRdPrepTxt(rows, { ...opts, includeHeader: true })
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => [line])

  const wb = utils.book_new()
  const wsSummary = utils.aoa_to_sheet(summary)
  const wsDetail = utils.aoa_to_sheet([detailHeader, ...detailBody])
  const wsPipe = utils.aoa_to_sheet([['rd_prep_pipe_line'], ...pipePreview])
  utils.book_append_sheet(wb, wsSummary, 'Summary')
  utils.book_append_sheet(wb, wsDetail, 'PND1')
  utils.book_append_sheet(wb, wsPipe, 'PipePreview')
  applyErpDownloadFontToWorkbook(wb)
  return wb
}

export function buildPnd1RdPrepXlsxFilename(periodKey: string, filingForm: string): string {
  const pk = String(periodKey || 'period').replace(/[^\w.-]+/g, '_')
  const form = String(filingForm || 'pnd1').replace(/[^\w.-]+/g, '_')
  return `pnd1-review-${form}-${pk}.xlsx`
}
