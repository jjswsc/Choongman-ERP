/**
 * 태국 VAT·PP36·원천세·PND54 ledger API — thai-vat-filing.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

export async function getVatLedger(params: {
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
  q.set('storeFilter', params.storeFilter || 'All')
  const res = await apiFetchWithOffline(`/api/vatLedger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export type StoreTaxFilingProfileDto = {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
  updatedAt?: string | null
  updatedBy?: string | null
}

export async function getStoreTaxFilingProfile(storeCode: string) {
  const q = new URLSearchParams({ storeCode })
  const res = await apiFetchWithOffline(`/api/storeTaxFilingProfiles?${q}`)
  const data = (await res.json()) as { profile?: StoreTaxFilingProfileDto; error?: string }
  if (!res.ok) {
    return { profile: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { profile: data.profile || null }
}

export async function getStoreTaxFilingProfiles() {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles')
  const data = (await res.json()) as {
    profiles?: StoreTaxFilingProfileDto[]
    tableMissing?: boolean
    error?: string
  }
  if (!res.ok) {
    return { profiles: [] as StoreTaxFilingProfileDto[], error: data?.error || `HTTP_${res.status}` }
  }
  return { profiles: data.profiles || [], tableMissing: !!data.tableMissing }
}

export async function saveStoreTaxFilingProfile(params: {
  storeCode: string
  vendorCode?: string
  taxpayerName: string
  taxId: string
  branchNo: string
  placeOfBusiness?: string
  ssoAccountNo?: string
  ssoBranchCode?: string
  ssoOfficeAddress?: string
  ssoPostcode?: string
  ssoPhone?: string
  ssoFax?: string
  ssoEmail?: string
}) {
  const res = await apiFetchWithOffline('/api/storeTaxFilingProfiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success?: boolean
    profile?: StoreTaxFilingProfileDto
    error?: string
    hint?: string
  }>
}

export type VatLedgerStoreNameGapsReportDto = {
  taxMonths: string[]
  storeFilter: string
  inScopeRowCount: number
  emptyStoreNameRowCount: number
  emptyStoreNameOutputNet: number
  emptyStoreNameOutputVat: number
  emptyStoreNameInputNet: number
  emptyStoreNameInputVat: number
  otherStoreRowCount: number
  otherStoreOutputVat: number
  otherStoreInputVat: number
  samples: {
    id?: number
    doc_date: string
    direction: string
    net_amount: number
    vat_amount: number
    counterparty_name: string
    invoice_number: string
    memo: string
  }[]
}

export type IntercompanyVatReconcileReportDto = {
  months: string[]
  storeFilter: string
  issuedCount: number
  matchedCount: number
  missingInStoreCount: number
  extraInStoreCount: number
  diffCount: number
  hqIssuedNetTotal: number
  storeInputNetTotal: number
  storeInputVatTotal: number
  diffNetTotal: number
  rows: {
    storeName: string
    referenceNo: string
    hqIssuedNet: number
    storeInputNet: number
    storeInputVat: number
    diffNet: number
    status: 'missing_in_store_input' | 'extra_in_store_input' | 'net_diff'
  }[]
}

export async function getVatLedgerStoreNameGaps(params: {
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
  const res = await apiFetchWithOffline(`/api/getVatLedgerStoreNameGaps?${q}`)
  const data = (await res.json()) as { report?: VatLedgerStoreNameGapsReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

export async function getIntercompanyVatReconcile(params: {
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
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { report?: IntercompanyVatReconcileReportDto; error?: string }
  if (!res.ok) {
    return { report: null, error: data?.error || `HTTP_${res.status}` }
  }
  return { report: data.report || null }
}

/** 본사 출고(세금계산서) 이력이 있을 때만 매장↔본사 VAT 대사 UI를 노출 */
export async function probeIntercompanyVatReconcileApplicable(params: {
  userRole: string
  taxMonth: string
  yearMonth?: string
  periodType?: 'monthly' | 'half_year' | 'annual'
  storeFilter: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    taxMonth: params.taxMonth,
    storeFilter: params.storeFilter,
    probeOnly: '1',
  })
  if (params.yearMonth) q.set('yearMonth', params.yearMonth)
  if (params.periodType) q.set('periodType', params.periodType)
  const res = await apiFetchWithOffline(`/api/ops/intercompany-vat-reconcile?${q}`)
  const data = (await res.json()) as { applicable?: boolean; error?: string }
  if (!res.ok) {
    return { applicable: false, error: data?.error || `HTTP_${res.status}` }
  }
  return { applicable: Boolean(data.applicable) }
}

export async function saveVatLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    id?: number
    error?: string
    pendingEvidenceCount?: number
    pendingEvidenceRows?: {
      id: number
      docDate: string
      counterpartyName: string
      invoiceNumber: string
      storeName: string
      memo: string
    }[]
  }>
}

export async function deleteVatLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/vatLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPp36Ledger(params: {
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
  const res = await apiFetchWithOffline(`/api/pp36Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePp36LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePp36LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pp36Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getWithholdingTaxLedger(params: {
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
  const res = await apiFetchWithOffline(`/api/withholdingTaxLedger?${q}`)
  return res.json() as Promise<{ entries: Record<string, unknown>[] }>
}

export async function saveWithholdingTaxLedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deleteWithholdingTaxLedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/withholdingTaxLedger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}

export async function getPnd54Ledger(params: {
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
  const res = await apiFetchWithOffline(`/api/pnd54Ledger?${q}`)
  const data = (await res.json()) as { entries?: Record<string, unknown>[]; error?: string }
  if (!res.ok) {
    return { entries: [], error: data?.error || `HTTP_${res.status}` }
  }
  return { entries: data.entries || [], error: data.error }
}

export async function savePnd54LedgerEntry(params: Record<string, unknown> & { userRole: string }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; error?: string }>
}

export async function deletePnd54LedgerEntry(params: { userRole: string; id: number }) {
  const res = await apiFetchWithOffline('/api/pnd54Ledger', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; error?: string }>
}
