/**
 * ภ.ง.ด.53 — กรมสรรพากร Format กลาง v2.0 (pipe |, UTF-8, CRLF)
 * RD Prep 가져오기 → .rdx 생성 → efiling.rd.go.th 업로드
 */
import type { WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'
import { effectivePnd353FormHint, type PndFormHint } from '@/lib/withholding-tax-csv'
import {
  isoToRdBeDate8,
  payeeTin10,
  rdDigitsOnly,
  rdFormatAmount2,
  rdPipeSafe,
  splitThaiPayeeName,
  taxMonthToRdParts,
} from '@/lib/rd-filing-common'
import { ledgerRowsToRdPrepSoftAttachmentTxt } from '@/lib/rd-prep-soft-attachment-txt'

/** Format กลาง v2.0 — HEADER 25칸 / DETAIL 38칸 */
export const PND53_RD_HEADER_FIELD_COUNT = 25
export const PND53_RD_DETAIL_FIELD_COUNT = 38

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
    const effective = effectivePnd353FormHint(r)
    if (!effective) return false
    if (formHint === 'PND3') return effective === 'PND3'
    if (formHint === 'PND53') return effective === 'PND53'
    return effective === 'PND3' || effective === 'PND53'
  })
}

/** RD Prep 소프트 매핑 파일명 — PND3 파일에 pnd53 접두사를 붙이지 않음 */
export function buildPnd353RdPrepSoftFilename(formHint: PndFormHint, periodKey: string): string {
  const period = String(periodKey || '').trim() || 'period'
  if (formHint === 'PND3') return `pnd3-rd-prep-soft-${period}.txt`
  if (formHint === 'PND53') return `pnd53-rd-prep-soft-${period}.txt`
  return `pnd3-pnd53-rd-prep-soft-${period}.txt`
}

function rdPrepSoftOpts(
  isPnd3Layout: boolean,
  includeHeader: boolean
): Parameters<typeof ledgerRowsToRdPrepSoftAttachmentTxt>[1] {
  return {
    includeHeader,
    /** ภ.ง.ด.3만 4칸 이름. ภ.ง.ด.53은 이름 1칸 + ถนน Col6 (ชื่อกลาง 없음) */
    splitNaturalPersonName: isPnd3Layout,
    splitGeoAddress: true,
    roadMaxLen: isPnd3Layout ? undefined : 60,
  }
}

/** RD Prep 소프트 매핑(빈 칸 `|` 유지) — 샘플 레이아웃 */
export function pnd53LedgerToRdPrepSoftTxt(
  rows: WithholdingTaxLedgerRow[],
  formHint: PndFormHint = 'PND53',
  opts?: { includeHeader?: boolean }
): string {
  const includeHeader = opts?.includeHeader === true
  const filtered = filterPnd53Rows(rows, formHint)
  if (formHint === 'ALL') {
    const pnd3 = filtered.filter((r) => effectivePnd353FormHint(r) === 'PND3')
    const pnd53 = filtered.filter((r) => effectivePnd353FormHint(r) === 'PND53')
    const parts: string[] = []
    if (pnd3.length > 0) {
      parts.push(ledgerRowsToRdPrepSoftAttachmentTxt(pnd3, rdPrepSoftOpts(true, includeHeader)))
    }
    if (pnd53.length > 0) {
      parts.push(
        ledgerRowsToRdPrepSoftAttachmentTxt(pnd53, rdPrepSoftOpts(false, includeHeader && pnd3.length === 0))
      )
    }
    return parts.join('\r\n')
  }
  return ledgerRowsToRdPrepSoftAttachmentTxt(filtered, rdPrepSoftOpts(formHint === 'PND3', includeHeader))
}

/** RD ใบแนบ ประเภทเงินได้ — 한글·영문 원장을 태국어 양식 문구로 */
export function toPnd53IncomeTypeLabel(raw: unknown): string {
  const s = rdPipeSafe(raw).slice(0, 100)
  if (!s) return ''
  if (/[\u0E00-\u0E7F]/.test(s)) return s
  const lower = s.toLowerCase()
  if (/royalt|로열티|ค่าสิทธิ/.test(lower) || s.includes('로열티')) return 'ค่าสิทธิ'
  if (/rent|lease|임대|ค่าเช่า/.test(lower) || s.includes('임대')) return 'ค่าเช่า'
  if (/interest|이자|ดอกเบี้ย/.test(lower) || s.includes('이자')) return 'ดอกเบี้ย'
  if (/service|용역|서비스|ค่าบริการ/.test(lower) || s.includes('서비스') || s.includes('용역')) {
    return 'ค่าบริการ'
  }
  return s
}

function groupRowsForDetail(rows: WithholdingTaxLedgerRow[]): DetailGroup[] {
  const byPayee = new Map<string, DetailGroup[]>()
  for (const row of rows) {
    const payeeTaxId = rdDigitsOnly(row.payee_tax_id).slice(0, 13)
    const payeeName = rdPipeSafe(row.payee_name)
    const key = `${payeeTaxId}|${payeeName}`
    const list = byPayee.get(key) ?? []
    let group = list[list.length - 1]
    if (!group || group.slots.length >= 3) {
      group = { payeeTaxId, payeeName, slots: [] }
      list.push(group)
      byPayee.set(key, list)
    }
    group.slots.push({
      paidDate: isoToRdBeDate8(row.payment_date) || '00000000',
      taxRate: rdFormatAmount2(row.wht_rate),
      paidAmt: rdFormatAmount2(row.gross_amount),
      taxAmt: rdFormatAmount2(row.wht_amount),
      incomeType: toPnd53IncomeTypeLabel(row.income_type),
      payCon: '1',
    })
  }
  return [...byPayee.values()].flat().filter((g) => g.slots.length > 0)
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
    rdPipeSafe(opts.deptName || 'สำนักงานใหญ่').slice(0, 80),
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
    rdPipeSafe(opts.rdUserId || '').slice(0, 20),
    opts.formFlag ?? '2',
  ]
  return fields.join('|')
}

function slotField(slot: DetailIncomeSlot | undefined, key: keyof DetailIncomeSlot): string {
  if (!slot) {
    if (key === 'paidDate') return '00000000'
    if (key.startsWith('tax') || key.startsWith('paid')) return '0.00'
    return ''
  }
  return slot[key]
}

function buildDetailLine(seqNo: number, payerBranch: string, group: DetailGroup): string {
  const { titleName, firstName, middleName, surName } = splitThaiPayeeName(group.payeeName)
  const givenName = [firstName, middleName].filter(Boolean).join(' ')
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
    givenName,
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
