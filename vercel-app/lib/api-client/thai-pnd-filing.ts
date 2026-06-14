/**
 * 태국 PND·KT20K·연간 요약 API — thai-vat-filing.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

export function getExportVatLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  excludePosAuto?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.excludePosAuto) q.set('excludePosAuto', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportVatLedgerCsv?${q}`
  }
  return `/api/exportVatLedgerCsv?${q}`
}

export function getExportWithholdingTaxLedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  format?: 'raw' | 'submission'
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.format) q.set('format', params.format)
  if (params.formHint) q.set('formHint', params.formHint)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportWithholdingTaxLedgerCsv?${q}`
  }
  return `/api/exportWithholdingTaxLedgerCsv?${q}`
}

export function getExportPp36LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPp36LedgerCsv?${q}`
  }
  return `/api/exportPp36LedgerCsv?${q}`
}

export function getExportPnd54LedgerCsvUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd54LedgerCsv?${q}`
  }
  return `/api/exportPnd54LedgerCsv?${q}`
}

export function getExportPnd1RdPrepTxtUrl(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
  payerTaxId?: string
  payerBranchNo?: string
  payerName?: string
  includeHeader?: boolean
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  if (params.payerTaxId) q.set('payerTaxId', params.payerTaxId)
  if (params.payerBranchNo) q.set('payerBranchNo', params.payerBranchNo)
  if (params.payerName) q.set('payerName', params.payerName)
  if (params.includeHeader) q.set('includeHeader', '1')
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportPnd1RdPrepTxt?${q}`
  }
  return `/api/exportPnd1RdPrepTxt?${q}`
}

export type ValidatePnd1RdPrepResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'pnd1' | 'pnd1a' | 'all'
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
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'invalid_payee_tax_id_length'
      | 'missing_payment_date'
      | 'invalid_payment_date'
      | 'missing_income_type'
      | 'non_positive_withheld_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type ValidatePnd3Pnd53Result = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  filingForm: 'PND3' | 'PND53' | 'ALL'
  totalRows: number
  validRows: number
  warningCounts: {
    missingPayeeName: number
    missingPayeeTaxId: number
    missingIncomeType: number
    missingCertificateNo: number
    invalidWhtRate: number
    nonPositiveWithheldAmount: number
  }
  sampleWarnings: string[]
  issues: {
    lineNo: number
    rowId: number | null
    code:
      | 'missing_payee_name'
      | 'missing_payee_tax_id'
      | 'missing_income_type'
      | 'missing_certificate_no'
      | 'invalid_wht_rate'
      | 'non_positive_wht_amount'
    message: string
    payeeName: string
    certificateNo: string
  }[]
}

export type PayrollWhtTinGapResult = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  storeFilter: string
  payrollRowCount: number
  gapRowCount: number
  uniqueEmployeeCount: number
  gaps: {
    id: number | null
    paymentDate: string
    taxMonth: string
    payeeName: string
    storeName: string
    whtAmount: number
    certificateNo: string
    formHint: string
    memo: string
  }[]
}

export async function validatePnd1RdPrep(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  filingForm?: 'pnd1' | 'pnd1a' | 'all'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.filingForm) q.set('filingForm', params.filingForm)
  const res = await apiFetchWithOffline(`/api/validatePnd1RdPrep?${q}`)
  return res.json() as Promise<ValidatePnd1RdPrepResult>
}

export async function validatePnd3Pnd53(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  filingStatus?: 'all' | 'draft' | 'submitted'
  storeFilter?: string
  formHint?: 'PND3' | 'PND53' | 'ALL'
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.filingStatus) q.set('filingStatus', params.filingStatus)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.formHint) q.set('formHint', params.formHint)
  const res = await apiFetchWithOffline(`/api/validatePnd3Pnd53?${q}`)
  return res.json() as Promise<ValidatePnd3Pnd53Result>
}

export async function getPayrollWhtTinGaps(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({ userRole: params.userRole, taxMonth: params.taxMonth })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPayrollWhtTinGaps?${q}`)
  return res.json() as Promise<PayrollWhtTinGapResult>
}

export type Kt20kSettings = {
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
  updatedAt?: string
}

export async function getKt20kSettings(params: { userRole: string; year: number }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  const res = await apiFetchWithOffline(`/api/getKt20kSettings?${q}`)
  return res.json() as Promise<{ success: boolean; year: number; settings: Kt20kSettings }>
}

export async function saveKt20kSettings(params: {
  userRole: string
  year: number
  companyTaxId: string
  companyName: string
  ssoOfficeProvince: string
  ssoOfficePhone: string
  businessCode5: string
  fundRatePercent: string
  updatedBy?: string
}) {
  const res = await apiFetch('/api/saveKt20kSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export function getExportKt20kCsvUrl(params: { userRole: string; year: number; storeFilter?: string }) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    year: String(params.year),
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportKt20kCsv?${q}`
  return `/api/exportKt20kCsv?${q}`
}

export type Pnd91EmployeeAnnual = {
  employeeKey: string
  employeeId: number | null
  name: string
  store: string
  taxId: string | null
  monthCount: number
  annualGross: number
  annualWhtPayroll: number
  annualWhtLedger: number
  annualSso: number
  annualNetPay: number
  whtLedgerMismatch: boolean
}

export type Pnd91AnnualSummaryResult = {
  success: boolean
  year: number
  storeFilter: string
  filingDueDate: string
  employees: Pnd91EmployeeAnnual[]
  totals: {
    employeeCount: number
    annualGross: number
    annualWhtPayroll: number
    annualWhtLedger: number
    annualSso: number
    annualNetPay: number
    whtMismatchCount: number
  }
  warnings: string[]
  error?: string
}

export async function getPnd91AnnualSummary(params: {
  year: number
  storeFilter?: string
}): Promise<Pnd91AnnualSummaryResult> {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getPnd91AnnualSummary?${q}`)
  return res.json() as Promise<Pnd91AnnualSummaryResult>
}

export function getExportPnd91AnnualCsvUrl(params: {
  year: number
  storeFilter?: string
  checklistJson?: string
}) {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.checklistJson) q.set('checklistJson', params.checklistJson)
  if (typeof window !== 'undefined') return `${window.location.origin}/api/exportPnd91AnnualCsv?${q}`
  return `/api/exportPnd91AnnualCsv?${q}`
}
