/**
 * 태국 법인세·세무 readiness API — thai-vat-filing.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

export type ThaiTaxFilingSummary = {
  period: {
    periodType: 'monthly' | 'half_year' | 'annual'
    periodKey: string
    startMonth: string
    endMonth: string
    months: string[]
  }
  vat: {
    outputNet: number
    outputVat: number
    inputNet: number
    inputVat: number
    payableVat: number
    missingTaxIdCount: number
    missingInvoiceCount: number
    rowCount: number
  }
  wht: {
    totalGross: number
    totalWithheld: number
    missingTaxIdCount: number
    missingCertificateCount: number
    rowCount: number
    byForm: Record<string, { gross: number; withheld: number; rows: number }>
  }
}

export type TaxReadinessChecklist = {
  period: {
    yearMonth: string
    startDate: string
    endDate: string
    storeFilter: string
  }
  limits: {
    sourceLimit: number
    hit: {
      bank: boolean
      petty: boolean
      card: boolean
      purchase: boolean
      sales: boolean
      journal: boolean
    }
  }
  domains: {
    bank: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    pettyCash: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    cardExpense: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    purchase: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
    }
    sales: {
      sourceCount: number
      journalLinkedCount: number
      missingJournalCount: number
      multiJournalSourceCount: number
      sampleMissingSourceIds: number[]
      sampleMultiSourceIds: number[]
      monthMismatchCount: number
      sampleMonthMismatchSourceIds: number[]
    }
  }
  score: {
    criticalIssues: number
    warningIssues: number
  }
  recommendations: string[]
}

export async function getThaiTaxFilingSummary(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getThaiTaxFilingSummary?${q}`)
  return res.json() as Promise<ThaiTaxFilingSummary>
}

export async function getTaxReadinessChecklist(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getTaxReadinessChecklist?${q}`)
  return res.json() as Promise<TaxReadinessChecklist>
}

export type CorporateTaxComputationData = {
  periodType: 'monthly' | 'half_year' | 'annual'
  filingForm: 'pnd50' | 'pnd51'
  periodKey: string
  months: string[]
  storeFilter: string
  accountingProfit: number
  taxAddBack: number
  taxDeduction: number
  taxableIncome: number
  projectedAnnualTaxableIncome: number
  taxRate: number
  estimatedTax: number
  filingTaxDue: number
  pdfMeta: {
    formCode: 'P.N.D.50' | 'P.N.D.51'
    periodLabel: string
    periodStartMonth: string
    periodEndMonth: string
    generatedAtBangkok: string
    storeScopeLabel: string
  }
  validation: {
    isValid: boolean
    errors: string[]
    warnings: string[]
  }
  adjustments: { type: 'add_back' | 'deduction'; itemName: string; amount: number; memo: string | null }[]
}

export async function getCorporateTaxComputation(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  const res = await apiFetchWithOffline(`/api/getCorporateTaxComputation?${q}`)
  return res.json() as Promise<CorporateTaxComputationData>
}

export function getExportCorporateTaxPackageCsvUrl(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter?: string
  userStore?: string
  taxRate?: number
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    periodType: params.periodType || 'monthly',
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.taxRate != null && !isNaN(Number(params.taxRate))) q.set('taxRate', String(params.taxRate))
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportCorporateTaxPackageCsv?${q}`
  }
  return `/api/exportCorporateTaxPackageCsv?${q}`
}

export async function saveCorporateTaxAdjustments(params: {
  userRole: string
  yearMonth: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  adjustments: {
    adjustmentType: 'add_back' | 'deduction'
    itemCode?: string | null
    itemName: string
    amount: number
    memo?: string | null
  }[]
}) {
  const res = await apiFetchWithOffline('/api/saveCorporateTaxAdjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    periodKey?: string
    savedCount?: number
    rows?: Record<string, unknown>[]
    error?: string
  }>
}
