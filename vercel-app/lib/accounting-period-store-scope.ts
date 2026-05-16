import { canonicalizeStoreCodeForTaxProfile } from '@/lib/store-tax-filing-profile'

export const ACCOUNTING_PERIOD_ALL_SCOPE = 'All'

export async function normalizeAccountingPeriodStoreScope(
  storeFilter?: string | null
): Promise<string> {
  const raw = String(storeFilter || '').trim()
  if (!raw || raw === '*' || raw === ACCOUNTING_PERIOD_ALL_SCOPE) return ACCOUNTING_PERIOD_ALL_SCOPE
  const code = await canonicalizeStoreCodeForTaxProfile(raw)
  return code || raw
}

export function isAccountingPeriodAllScope(storeScope: string): boolean {
  const s = String(storeScope || '').trim()
  return !s || s === ACCOUNTING_PERIOD_ALL_SCOPE || s === '*'
}
