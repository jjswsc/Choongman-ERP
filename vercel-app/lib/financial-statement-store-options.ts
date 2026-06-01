import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { labelForStore } from '@/lib/store-list-keys'

export type FinancialStatementStoreOption = {
  value: string
  label: string
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

export function resolveFinancialStatementStoreLabel(
  storeFilter: string,
  storeLabels: Record<string, string>,
  t: (key: string) => string,
  opts?: { franchiseAggregateAll?: boolean }
): string {
  if (storeFilter === 'All') {
    if (opts?.franchiseAggregateAll) {
      return t('store_all_my_franchise_stores') || t('salesSelectMyFranchiseStoresAll') || 'All my stores'
    }
    return t('all') || 'All'
  }
  if (isFinancialStatementHeadOfficeStore(storeFilter, storeLabels)) {
    return t('pettyScopeOffice') || 'Office'
  }
  return labelForStore(storeLabels, storeFilter) || storeFilter
}
