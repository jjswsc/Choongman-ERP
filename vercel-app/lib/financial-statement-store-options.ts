import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { labelForStore } from '@/lib/store-list-keys'

export type FinancialStatementStoreOption = {
  value: string
  label: string
}

/** UI 전용 — 매장 미선택(전체 해제). API storeFilter All 과 구분 */
export const FINANCIAL_STATEMENT_STORE_NONE = '__none__'

export function isFinancialStatementStoreNone(storeFilter: string | undefined | null): boolean {
  return String(storeFilter || '').trim() === FINANCIAL_STATEMENT_STORE_NONE
}

/** 손익·대차 매장 선택 — 본사/오피스 여부 (코드·표시명 모두 검사) */
export function isFinancialStatementHeadOfficeStore(
  storeCode: string,
  storeLabels?: Record<string, string>
): boolean {
  const code = String(storeCode || '').trim()
  if (!code) return false
  const label = labelForStore(storeLabels || {}, code)
  return (
    isOfficeStore(code) ||
    isHeadOfficeLikeStoreName(code) ||
    isHeadOfficeLikeStoreName(label)
  )
}

/** 가맹 매장만 (본사·오피스 제외). value=store_code, label=표시명 */
export function buildFinancialStatementFranchiseStoreOptions(
  storeCodes: string[],
  storeLabels?: Record<string, string>
): FinancialStatementStoreOption[] {
  const seen = new Set<string>()
  const out: FinancialStatementStoreOption[] = []
  for (const raw of storeCodes || []) {
    const value = String(raw || '').trim()
    if (!value || seen.has(value)) continue
    if (isFinancialStatementHeadOfficeStore(value, storeLabels)) continue
    seen.add(value)
    out.push({ value, label: labelForStore(storeLabels || {}, value) || value })
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  return out
}

export function normalizeFinancialStatementStoreCodes(stores: string[]): string[] {
  const out: string[] = []
  for (const s of stores) {
    const v = String(s || '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/** UI 선택 → API storeFilter */
export function encodeFinancialStatementStoreFilter(params: {
  franchiseStoreCodes: string[]
  selectedFranchiseStores: string[]
  officeSelected: boolean
  allFranchiseSelected: boolean
}): string {
  if (params.officeSelected) return '본사'
  if (
    params.allFranchiseSelected ||
    (params.franchiseStoreCodes.length > 0 &&
      params.selectedFranchiseStores.length === params.franchiseStoreCodes.length)
  ) {
    return 'All'
  }
  const normalized = normalizeFinancialStatementStoreCodes(params.selectedFranchiseStores)
  if (normalized.length === 0) return FINANCIAL_STATEMENT_STORE_NONE
  if (normalized.length === 1) return normalized[0]!
  return normalized.join(',')
}

export function decodeFinancialStatementStoreFilter(
  storeFilter: string,
  franchiseStoreCodes: string[]
): { selectedFranchiseStores: string[]; officeSelected: boolean } {
  const trimmed = String(storeFilter || '').trim()
  if (trimmed === FINANCIAL_STATEMENT_STORE_NONE) {
    return { selectedFranchiseStores: [], officeSelected: false }
  }
  if (trimmed === '본사') {
    return { selectedFranchiseStores: [], officeSelected: true }
  }
  if (!trimmed || trimmed === 'All') {
    return { selectedFranchiseStores: [...franchiseStoreCodes], officeSelected: false }
  }
  if (trimmed.includes(',')) {
    const selected = normalizeFinancialStatementStoreCodes(trimmed.split(','))
    return { selectedFranchiseStores: selected, officeSelected: false }
  }
  return { selectedFranchiseStores: [trimmed], officeSelected: false }
}

export function resolveFinancialStatementStoreLabel(
  storeFilter: string,
  storeLabels: Record<string, string>,
  t: (key: string) => string,
  opts?: { franchiseAggregateAll?: boolean }
): string {
  if (isFinancialStatementStoreNone(storeFilter)) {
    return t('salesStoreDeselectAll') || 'No selection'
  }
  if (storeFilter === 'All') {
    if (opts?.franchiseAggregateAll) {
      return t('store_all_my_franchise_stores') || t('salesSelectMyFranchiseStoresAll') || 'All my stores'
    }
    return t('all') || 'All'
  }
  const multi = storeFilter.includes(',')
    ? storeFilter
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  if (multi && multi.length > 1) {
    return multi.map((code) => labelForStore(storeLabels, code) || code).join(', ')
  }
  if (isFinancialStatementHeadOfficeStore(storeFilter, storeLabels)) {
    return t('pettyScopeOffice') || 'Office'
  }
  return labelForStore(storeLabels, storeFilter) || storeFilter
}
