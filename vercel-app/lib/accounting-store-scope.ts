import { buildLegacyToCanonicalMap, fetchErpStoresMaster } from '@/lib/erp-store-master'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { normStoreKey } from '@/lib/store-list-keys'

/** 매장·가맹 등 — 요청 매장이 허용 범위 밖일 때 */
export class AccountingStoreScopeForbidden extends Error {
  constructor() {
    super('FORBIDDEN_STORE_SCOPE')
    this.name = 'AccountingStoreScopeForbidden'
  }
}

export function isAccountingStoreScopeForbidden(e: unknown): boolean {
  return e instanceof AccountingStoreScopeForbidden
}

export type AccountingStoreAuthScope = {
  userRole?: string
  userStore?: string
  allowedStores?: string[]
}

/** JWT·직원 매장 목록(중복 제거) */
export function collectAccountingAllowedStores(auth: AccountingStoreAuthScope): string[] {
  const userStore = String(auth.userStore || '').trim()
  const fromJwt = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...fromJwt, userStore]) {
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** 본사·회계·본사 소속 매장 — 전 매장(또는 요청 매장) 조회 허용 */
export function canAccessAllAccountingStores(auth: AccountingStoreAuthScope): boolean {
  const userRole = String(auth.userRole || '').trim()
  const userStore = String(auth.userStore || '').trim()
  return (
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)
  )
}

/**
 * 재무제표·시산 등 storeFilter 확정 (세무 원장 API와 동일 규칙).
 * 매장 매니저·가맹점주: allowedStores·소속 매장만, All/미지정 시 첫 허용 매장.
 */
export function resolveAccountingStoreFilterFromAuth(
  requestedStoreFilter: string | undefined | null,
  auth: AccountingStoreAuthScope
): string {
  const requested = String(requestedStoreFilter || '').trim()
  const allowedStores = collectAccountingAllowedStores(auth)

  if (canAccessAllAccountingStores(auth)) {
    if (requested && requested !== 'All' && requested !== '전체' && requested !== '*') {
      if (isOfficeStore(requested) || isHeadOfficeLikeStoreName(requested)) return 'All'
      return requested
    }
    return requested || 'All'
  }

  let effective = requested
  if (!effective || effective === 'All' || effective === '전체' || effective === '*') {
    effective = String(allowedStores[0] || '').trim()
    if (!effective) throw new AccountingStoreScopeForbidden()
    return effective
  }

  if (isOfficeStore(effective) || isHeadOfficeLikeStoreName(effective)) {
    throw new AccountingStoreScopeForbidden()
  }

  const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, effective))
  if (!allowed) throw new AccountingStoreScopeForbidden()
  return effective
}

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
