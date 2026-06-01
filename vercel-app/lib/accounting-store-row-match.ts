import { type ErpStoreMasterRow } from '@/lib/erp-store-master'
import {
  erpStoreKeysMatch,
  findErpStoreMasterForScopeKey,
  resolveErpStoreIdentitySync,
} from '@/lib/erp-store-identity'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isHeadOfficeCounterpartyLabel } from '@/lib/head-office-counterparty-labels'
import { isOfficeStore } from '@/lib/permissions'

function normalizeStoreFilter(storeFilter?: string | null): string {
  const s = String(storeFilter || '').trim()
  if (!s || s === 'All' || s === '*') return ''
  return s
}

function isOfficeEquivalentStore(a: string, b: string): boolean {
  const aa = String(a || '').trim()
  const bb = String(b || '').trim()
  if (!aa || !bb) return false
  return isHeadOfficeLikeStoreName(aa) && isHeadOfficeLikeStoreName(bb)
}

function isOfficeAccountingScopeFilter(
  filter: string,
  scopeStoreCode: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): boolean {
  const candidates = [filter, scopeStoreCode].map((s) => String(s || '').trim()).filter(Boolean)
  for (const c of candidates) {
    if (isOfficeStore(c) || isHeadOfficeLikeStoreName(c)) return true
    const master = findErpStoreMasterForScopeKey(c, masters, legacyToCanonical)
    if (master) {
      const code = String(master.store_code || '').trim()
      const name = String(master.display_name || '').trim()
      if (isOfficeStore(code) || isHeadOfficeLikeStoreName(code)) return true
      if (isOfficeStore(name) || isHeadOfficeLikeStoreName(name)) return true
    }
  }
  return false
}

/** PP30·원장·손익 공통 — storeFilter 대비 store_name(또는 location) 일치 */
export function matchesAccountingStoreScopeRow(
  storeName: string,
  storeFilter: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): boolean {
  const requested = normalizeStoreFilter(storeFilter)
  if (!requested) return true

  const rowStore = String(storeName || '').trim()
  if (!rowStore) return false

  const scopeIdentity = resolveErpStoreIdentitySync(requested, masters, legacyToCanonical)
  const scopeStoreCode = scopeIdentity.storeCode

  if (isOfficeEquivalentStore(rowStore, requested)) return true
  if (scopeStoreCode && isOfficeEquivalentStore(rowStore, scopeStoreCode)) return true
  if (
    isHeadOfficeCounterpartyLabel(rowStore) &&
    isOfficeAccountingScopeFilter(requested, scopeStoreCode, masters, legacyToCanonical)
  ) {
    return true
  }
  return erpStoreKeysMatch(rowStore, requested, masters, legacyToCanonical)
}
