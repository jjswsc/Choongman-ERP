/**
 * ภ.พ.30 — RD Prep 가져오기용 pipe TXT (매출·매입 명세 + 합계)
 * RD Prep에서 가져온 뒤 .rdx 생성 → efiling.rd.go.th 업로드
 */
import type { VatLedgerRow } from '@/lib/vat-ledger-csv'
import {
  isoToRdBeDate8,
  rdDigitsOnly,
  rdFormatAmount2,
  rdPipeSafe,
  taxMonthToRdParts,
} from '@/lib/rd-filing-common'

export type Pp30RdPrepTxtOptions = {
  payerTaxId: string
  payerBranchNo?: string
  payerName?: string
  placeOfBusiness?: string
  taxMonth: string
  formType?: string
  outputNet: number
  outputVat: number
  inputNet: number
  inputVat: number
}

function sortRows(rows: VatLedgerRow[]): VatLedgerRow[] {
  return [...rows].sort((a, b) => {
    const da = String(a.doc_date || '')
    const db = String(b.doc_date || '')
    if (da !== db) return da.localeCompare(db)
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

function buildHeaderLine(opts: Pp30RdPrepTxtOptions, outCount: number, inCount: number): string {
  const taxId = rdDigitsOnly(opts.payerTaxId).slice(0, 13)
  const branch = rdDigitsOnly(opts.payerBranchNo).padStart(6, '0').slice(-6) || '000000'
  const { month, yearBe } = taxMonthToRdParts(opts.taxMonth)
  const payable = (Number(opts.outputVat) || 0) - (Number(opts.inputVat) || 0)
  const fields = [
    'H',
    '0000',
    taxId,
    branch,
    '1',
    'PP30',
    taxId,
    branch,
    rdPipeSafe(opts.payerName),
    rdPipeSafe(opts.placeOfBusiness),
    month,
    yearBe,
    String(opts.formType || '00').padStart(2, '0').slice(0, 2),
    rdFormatAmount2(opts.outputNet),
    rdFormatAmount2(opts.outputVat),
    rdFormatAmount2(opts.inputNet),
    rdFormatAmount2(opts.inputVat),
    rdFormatAmount2(payable > 0 ? payable : 0),
    rdFormatAmount2(payable < 0 ? Math.abs(payable) : 0),
    String(outCount),
    String(inCount),
  ]
  return fields.join('|')
}

function buildDetailLine(
  seqNo: number,
  direction: 'output' | 'input',
  row: VatLedgerRow
): string {
  const fields = [
    'D',
    String(seqNo),
    direction === 'output' ? 'S' : 'P',
    isoToRdBeDate8(row.doc_date),
    rdPipeSafe(row.invoice_number),
    rdPipeSafe(row.counterparty_name),
    rdDigitsOnly(row.counterparty_tax_id).slice(0, 13),
    rdFormatAmount2(row.net_amount),
    rdFormatAmount2(row.vat_amount),
    rdPipeSafe(row.vat_status),
    rdPipeSafe(row.memo).slice(0, 200),
  ]
  return fields.join('|')
}

export function pp30LedgerToRdPrepTxt(
  outputRows: VatLedgerRow[],
  inputRows: VatLedgerRow[],
  opts: Pp30RdPrepTxtOptions
): string {
  const outSorted = sortRows(outputRows)
  const inSorted = sortRows(inputRows)
  const lines = [buildHeaderLine(opts, outSorted.length, inSorted.length)]
  let seq = 0
  for (const row of outSorted) {
    seq += 1
    lines.push(buildDetailLine(seq, 'output', row))
  }
  for (const row of inSorted) {
    seq += 1
    lines.push(buildDetailLine(seq, 'input', row))
  }
  return lines.join('\r\n')
}

export function listPp30RdPrepFieldGaps(opts: Pick<Pp30RdPrepTxtOptions, 'payerTaxId' | 'payerName'>): {
  required: ('payerName' | 'payerTaxId13')[]
  optional: ('placeOfBusiness' | 'payerBranchNo')[]
} {
  const required: ('payerName' | 'payerTaxId13')[] = []
  if (!rdPipeSafe(opts.payerName)) required.push('payerName')
  if (rdDigitsOnly(opts.payerTaxId).length !== 13) required.push('payerTaxId13')
  const optional: ('placeOfBusiness' | 'payerBranchNo')[] = []
  return { required, optional }
}
