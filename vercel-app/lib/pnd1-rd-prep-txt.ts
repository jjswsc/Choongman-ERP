export type Pnd1SourceRow = {
  payment_date?: string | null
  tax_month?: string | null
  store_name?: string | null
  payee_name?: string | null
  payee_tax_id?: string | null
  /** 선택 — 있으면 주소 3칸으로 나눔 (없으면 빈 칸 ||||) */
  payee_address?: string | null
  income_type?: string | null
  wht_rate?: number | string | null
  gross_amount?: number | string | null
  wht_amount?: number | string | null
  certificate_no?: string | null
  memo?: string | null
}

export type Pnd1RdPrepTxtOptions = {
  payerTaxId?: string
  payerBranchNo?: string
  payerName?: string
  includeHeader?: boolean
}

export type Pnd1ValidationSummary = {
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    invalidPayeeTaxIdLength: number
    missingPaymentDate: number
    invalidPaymentDate: number
    missingIncomeType: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: Pnd1ValidationIssue[]
}

export type Pnd1ValidationIssueCode =
  | 'missing_payee_name'
  | 'missing_payee_tax_id'
  | 'invalid_payee_tax_id_length'
  | 'missing_payment_date'
  | 'invalid_payment_date'
  | 'missing_income_type'
  | 'non_positive_withheld_amount'

export type Pnd1ValidationIssue = {
  lineNo: number
  rowId: number | null
  code: Pnd1ValidationIssueCode
  message: string
  payeeName: string
  certificateNo: string
}

import {
  ledgerRowsToRdPrepSoftAttachmentTxt,
  splitPayeeAddressParts,
} from '@/lib/rd-prep-soft-attachment-txt'

export { splitPayeeAddressParts }

function pipeSafe(v: unknown): string {
  return String(v ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/[|]/g, ' ')
    .trim()
}

function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function hasIsoDate(v: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim().slice(0, 10))
}

export function validatePnd1Rows(rows: Pnd1SourceRow[]): Pnd1ValidationSummary {
  const warningCounts = {
    missingPayeeName: 0,
    missingPayeeTaxId: 0,
    invalidPayeeTaxIdLength: 0,
    missingPaymentDate: 0,
    invalidPaymentDate: 0,
    missingIncomeType: 0,
    nonPositiveWithheldAmount: 0,
  }
  const sampleWarnings: string[] = []
  const issues: Pnd1ValidationIssue[] = []

  const pushSample = (msg: string) => {
    if (sampleWarnings.length < 15) sampleWarnings.push(msg)
  }
  const pushIssue = (
    row: Pnd1SourceRow,
    lineNo: number,
    code: Pnd1ValidationIssueCode,
    message: string
  ) => {
    if (issues.length >= 500) return
    const rowId = Number((row as { id?: unknown }).id)
    issues.push({
      lineNo,
      rowId: Number.isFinite(rowId) && rowId > 0 ? rowId : null,
      code,
      message,
      payeeName: pipeSafe(row.payee_name),
      certificateNo: pipeSafe(row.certificate_no),
    })
  }

  ;(rows || []).forEach((row, idx) => {
    const lineNo = idx + 1
    const payeeName = pipeSafe(row.payee_name)
    const payeeTaxIdDigits = digitsOnly(row.payee_tax_id)
    const paymentDate = String(row.payment_date ?? '').trim()
    const incomeType = pipeSafe(row.income_type)
    const whtAmount = Number(row.wht_amount)

    if (!payeeName) {
      warningCounts.missingPayeeName += 1
      pushSample(`line ${lineNo}: missing payee_name`)
      pushIssue(row, lineNo, 'missing_payee_name', 'Missing payee name')
    }
    if (!payeeTaxIdDigits) {
      warningCounts.missingPayeeTaxId += 1
      pushSample(`line ${lineNo}: missing payee_tax_id`)
      pushIssue(row, lineNo, 'missing_payee_tax_id', 'Missing payee tax ID')
    } else if (payeeTaxIdDigits.length !== 13) {
      warningCounts.invalidPayeeTaxIdLength += 1
      pushSample(`line ${lineNo}: payee_tax_id must be 13 digits`)
      pushIssue(row, lineNo, 'invalid_payee_tax_id_length', 'Payee tax ID must be 13 digits')
    }
    if (!paymentDate) {
      warningCounts.missingPaymentDate += 1
      pushSample(`line ${lineNo}: missing payment_date`)
      pushIssue(row, lineNo, 'missing_payment_date', 'Missing payment date')
    } else if (!hasIsoDate(paymentDate)) {
      warningCounts.invalidPaymentDate += 1
      pushSample(`line ${lineNo}: invalid payment_date format (need YYYY-MM-DD)`)
      pushIssue(row, lineNo, 'invalid_payment_date', 'Invalid payment date format (need YYYY-MM-DD)')
    }
    if (!incomeType) {
      warningCounts.missingIncomeType += 1
      pushSample(`line ${lineNo}: missing income_type`)
      pushIssue(row, lineNo, 'missing_income_type', 'Missing income type')
    }
    // 원천세 0은 PND1 신고 목록에 정상 포함 — 음수만 오류
    if (!Number.isFinite(whtAmount) || whtAmount < 0) {
      warningCounts.nonPositiveWithheldAmount += 1
      pushSample(`line ${lineNo}: wht_amount must be >= 0`)
      pushIssue(row, lineNo, 'non_positive_withheld_amount', 'Withheld amount must be 0 or greater')
    }
  })

  const totalWarnings = Object.values(warningCounts).reduce((acc, n) => acc + n, 0)
  const totalRows = (rows || []).length
  return {
    totalRows,
    validRows: Math.max(0, totalRows - totalWarnings),
    warningCounts,
    sampleWarnings,
    issues,
  }
}

/** RD Prep 소프트 매핑용 — 빈 칸 `|` 유지 (PND1/PND53 공통 레이아웃) */
export function pnd1LedgerToRdPrepTxt(rows: Pnd1SourceRow[], opts: Pnd1RdPrepTxtOptions = {}): string {
  return ledgerRowsToRdPrepSoftAttachmentTxt(rows, { includeHeader: opts.includeHeader === true })
}
