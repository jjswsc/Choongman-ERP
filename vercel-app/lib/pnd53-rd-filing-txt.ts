/**
 * ภ.ง.ด.53 — กรมสรรพากร Format กลาง v2.0 (pipe |, UTF-8, CRLF)
 * RD Prep 가져오기 → .rdx 생성 → efiling.rd.go.th 업로드
 */
import type { WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'
import { normalizePndFormHint, type PndFormHint } from '@/lib/withholding-tax-csv'
import {
  isoToRdBeDate8,
  payeeTin10,
  rdDigitsOnly,
  rdFormatAmount2,
  rdPipeSafe,
  splitThaiPayeeName,
  taxMonthToRdParts,
} from '@/lib/rd-filing-common'

export type Pnd53RdFilingTxtOptions = {
  payerTaxId: string
  payerBranchNo?: string
  deptName?: string
  /** e-Filing 로그인 ID (USER_ID) */
  rdUserId?: string
  taxMonth: string
  formType?: string
  section3?: '0' | '1'
  section65?: '0' | '1'
  section69?: '0' | '1'
  branchType?: '' | 'V' | 'S'
  lto?: '0' | '1'
  formFlag?: '1' | '2'
}

type DetailIncomeSlot = {
  paidDate: string
  taxRate: string
  paidAmt: string
  taxAmt: string
  incomeType: string
  payCon: string
}

type DetailGroup = {
  payeeTaxId: string
  payeeName: string
  slots: DetailIncomeSlot[]
}

function filterPnd53Rows(rows: WithholdingTaxLedgerRow[], formHint: PndFormHint): WithholdingTaxLedgerRow[] {
  return (rows || []).filter((r) => {
    if (formHint === 'ALL') return normalizePndFormHint(r.form_hint) !== 'PND3'
    if (formHint === 'PND3') return false
    return normalizePndFormHint(r.form_hint) !== 'PND3'
  })
}

function groupRowsForDetail(rows: WithholdingTaxLedgerRow[]): DetailGroup[] {
  const map = new Map<string, DetailGroup>()
  for (const row of rows) {
    const payeeTaxId = rdDigitsOnly(row.payee_tax_id).slice(0, 13)
    const payeeName = rdPipeSafe(row.payee_name)
    const key = `${payeeTaxId}|${payeeName}`
    let group = map.get(key)
    if (!group) {
      group = { payeeTaxId, payeeName, slots: [] }
      map.set(key, group)
    }
    if (group.slots.length >= 3) {
      const newKey = `${key}#${group.slots.length}`
      let overflow = map.get(newKey)
      if (!overflow) {
        overflow = { payeeTaxId, payeeName, slots: [] }
        map.set(newKey, overflow)
      }
      group = overflow
    }
    if (group.slots.length < 3) {
      group.slots.push({
        paidDate: isoToRdBeDate8(row.payment_date),
        taxRate: rdFormatAmount2(row.wht_rate),
        paidAmt: rdFormatAmount2(row.gross_amount),
        taxAmt: rdFormatAmount2(row.wht_amount),
        incomeType: rdPipeSafe(row.income_type),
        payCon: '1',
      })
    }
  }
  return [...map.values()].filter((g) => g.slots.length > 0)
}

function buildHeaderLine(opts: Pnd53RdFilingTxtOptions, groups: DetailGroup[]): string {
  const payerTaxId = rdDigitsOnly(opts.payerTaxId).slice(0, 13)
  const payerBranch = rdDigitsOnly(opts.payerBranchNo).padStart(6, '0').slice(-6) || '000000'
  const { month, yearBe } = taxMonthToRdParts(opts.taxMonth)
  let totAmt = 0
  let totTax = 0
  for (const g of groups) {
    for (const s of g.slots) {
      totAmt += Number(s.paidAmt) || 0
      totTax += Number(s.taxAmt) || 0
    }
  }
  const totNum = groups.length
  const fields = [
    'H',
    '0000',
    payerTaxId,
    payerBranch,
    '1',
    'PND53',
    payerTaxId,
    payerBranch,
    rdPipeSafe(opts.deptName || 'สำนักงานใหญ่'),
    opts.section3 ?? '0',
    opts.section65 ?? '0',
    opts.section69 ?? '0',
    opts.lto ?? '0',
    month,
    yearBe,
    opts.branchType ?? 'V',
    String(opts.formType || '00').padStart(2, '0').slice(0, 2),
    String(totNum),
    rdFormatAmount2(totAmt),
    rdFormatAmount2(totTax),
    '0.00',
    rdFormatAmount2(totTax),
    '0.00',
    rdPipeSafe(opts.rdUserId || ''),
    opts.formFlag ?? '1',
  ]
  return fields.join('|')
}

function slotField(slot: DetailIncomeSlot | undefined, key: keyof DetailIncomeSlot): string {
  if (!slot) return key === 'paidDate' ? '' : key.startsWith('tax') || key.startsWith('paid') ? '0.00' : ''
  return slot[key]
}

function buildDetailLine(seqNo: number, payerBranch: string, group: DetailGroup): string {
  const { titleName, firstName, surName } = splitThaiPayeeName(group.payeeName)
  const s1 = group.slots[0]
  const s2 = group.slots[1]
  const s3 = group.slots[2]
  const fields = [
    'D',
    String(seqNo),
    payerBranch,
    group.payeeTaxId,
    payeeTin10(group.payeeTaxId),
    titleName,
    firstName,
    surName,
    slotField(s1, 'paidDate'),
    slotField(s1, 'taxRate'),
    slotField(s1, 'paidAmt'),
    slotField(s1, 'taxAmt'),
    slotField(s1, 'incomeType'),
    slotField(s1, 'payCon'),
    slotField(s2, 'paidDate'),
    slotField(s2, 'taxRate'),
    slotField(s2, 'paidAmt'),
    slotField(s2, 'taxAmt'),
    slotField(s2, 'incomeType'),
    slotField(s2, 'payCon'),
    slotField(s3, 'paidDate'),
    slotField(s3, 'taxRate'),
    slotField(s3, 'paidAmt'),
    slotField(s3, 'taxAmt'),
    slotField(s3, 'incomeType'),
    slotField(s3, 'payCon'),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]
  return fields.join('|')
}

export function pnd53LedgerToRdFilingTxt(
  rows: WithholdingTaxLedgerRow[],
  opts: Pnd53RdFilingTxtOptions,
  formHint: PndFormHint = 'PND53'
): string {
  const filtered = filterPnd53Rows(rows, formHint)
  const groups = groupRowsForDetail(filtered)
  const payerBranch = rdDigitsOnly(opts.payerBranchNo).padStart(6, '0').slice(-6) || '000000'
  const lines = [buildHeaderLine(opts, groups)]
  groups.forEach((g, idx) => {
    lines.push(buildDetailLine(idx + 1, payerBranch, g))
  })
  return lines.join('\r\n')
}

export type Pnd53RdFilingValidation = {
  totalRows: number
  detailGroups: number
  issues: { lineNo: number; code: string; message: string }[]
}

export function validatePnd53RdFilingRows(
  rows: WithholdingTaxLedgerRow[],
  opts: Pick<Pnd53RdFilingTxtOptions, 'payerTaxId' | 'taxMonth' | 'rdUserId'>
): Pnd53RdFilingValidation {
  const issues: Pnd53RdFilingValidation['issues'] = []
  const payerTaxId = rdDigitsOnly(opts.payerTaxId)
  if (payerTaxId.length !== 13) {
    issues.push({ lineNo: 0, code: 'invalid_payer_tax_id', message: 'Payer tax ID must be 13 digits' })
  }
  if (!/^\d{4}-\d{2}$/.test(String(opts.taxMonth || '').slice(0, 7))) {
    issues.push({ lineNo: 0, code: 'invalid_tax_month', message: 'taxMonth must be YYYY-MM' })
  }
  ;(rows || []).forEach((row, idx) => {
    const lineNo = idx + 1
    if (!rdPipeSafe(row.payee_name)) {
      issues.push({ lineNo, code: 'missing_payee_name', message: 'Missing payee name' })
    }
    const tin = rdDigitsOnly(row.payee_tax_id)
    if (tin.length !== 13) {
      issues.push({ lineNo, code: 'invalid_payee_tax_id', message: 'Payee tax ID must be 13 digits' })
    }
    if (!isoToRdBeDate8(row.payment_date)) {
      issues.push({ lineNo, code: 'invalid_payment_date', message: 'payment_date must be YYYY-MM-DD' })
    }
    if (!rdPipeSafe(row.income_type)) {
      issues.push({ lineNo, code: 'missing_income_type', message: 'Missing income type' })
    }
    const wht = Number(row.wht_amount)
    if (!Number.isFinite(wht) || wht <= 0) {
      issues.push({ lineNo, code: 'non_positive_wht', message: 'wht_amount must be > 0' })
    }
  })
  const groups = groupRowsForDetail(filterPnd53Rows(rows, 'PND53'))
  return { totalRows: (rows || []).length, detailGroups: groups.length, issues }
}
