import { buildLegacyToCanonicalMap, fetchErpStoresMaster } from '@/lib/erp-store-master'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { normStoreKey } from '@/lib/store-list-keys'

function normalizeStoreFilter(storeFilter?: string | null): string {
  const s = String(storeFilter || '').trim()
  if (!s || s === 'All' || s === '*') return ''
  return s
}

function canonicalizeStoreName(value: string, legacyToCanonical: Record<string, string>): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return legacyToCanonical[normStoreKey(raw)] || raw
}

function isOfficeEquivalentStore(a: string, b: string): boolean {
  const aa = String(a || '').trim()
  const bb = String(b || '').trim()
  if (!aa || !bb) return false
  return isHeadOfficeLikeStoreName(aa) && isHeadOfficeLikeStoreName(bb)
}

export async function createAccountingStoreScopeMatcher(storeFilter?: string | null) {
  const requested = normalizeStoreFilter(storeFilter)
  if (!requested) {
    return {
      requested,
      requestedCanonical: '',
      matches: (_storeName: string) => true,
    }
  }

  let legacyToCanonical: Record<string, string> = {}
  try {
    const masters = await fetchErpStoresMaster()
    legacyToCanonical = buildLegacyToCanonicalMap(masters || [])
  } catch {
    legacyToCanonical = {}
  }

  const requestedCanonical = canonicalizeStoreName(requested, legacyToCanonical)

  return {
    requested,
    requestedCanonical,
    matches: (storeName: string): boolean => {
      const rowStore = String(storeName || '').trim()
      if (!rowStore) return false
      const rowCanonical = canonicalizeStoreName(rowStore, legacyToCanonical)
      if (isOfficeEquivalentStore(rowStore, requested)) return true
      if (requestedCanonical && isOfficeEquivalentStore(rowStore, requestedCanonical)) return true
      if (rowCanonical && isOfficeEquivalentStore(rowCanonical, requested)) return true
      if (requestedCanonical && rowCanonical && requestedCanonical === rowCanonical) return true
      if (storesMatchForGradeLookup(rowStore, requested)) return true
      if (requestedCanonical && storesMatchForGradeLookup(rowStore, requestedCanonical)) return true
      if (rowCanonical && storesMatchForGradeLookup(rowCanonical, requested)) return true
      return false
    },
  }
}
