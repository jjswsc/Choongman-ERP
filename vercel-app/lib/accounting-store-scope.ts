import { buildLegacyToCanonicalMap, fetchErpStoresMaster, type ErpStoreMasterRow } from '@/lib/erp-store-master'
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
      /** 손익 본사(isHQ): 「본사」를 All로 바꾸지 않음 — 가맹용 창고 출고(매입) 합산이 매입에 들어가 이중·과대 집계됨 */
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

function masterRowMatchesScopeKey(
  row: ErpStoreMasterRow,
  key: string,
  legacyToCanonical: Record<string, string>
): boolean {
  const probe = String(key || '').trim()
  if (!probe) return false
  const canonical = canonicalizeStoreName(probe, legacyToCanonical)
  const candidates = Array.from(new Set([probe, canonical].filter(Boolean)))
  const sc = String(row.store_code || '').trim()
  const dn = String(row.display_name || '').trim()
  for (const c of candidates) {
    if (sc && storesMatchForGradeLookup(sc, c)) return true
    if (dn && storesMatchForGradeLookup(dn, c)) return true
    for (const alias of row.aliases || []) {
      const a = String(alias || '').trim()
      if (a && storesMatchForGradeLookup(a, c)) return true
    }
  }
  return false
}

/** display_name·별칭·레거시 입력으로 erp_stores 행 찾기 */
export function findErpStoreMasterForScopeKey(
  key: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): ErpStoreMasterRow | null {
  const raw = String(key || '').trim()
  if (!raw) return null
  for (const row of masters || []) {
    if (masterRowMatchesScopeKey(row, raw, legacyToCanonical)) return row
  }
  return null
}

/** store_code 기준 display_name·별칭·레거시 키 — VAT 원장 store_name(표시명·location) 매칭용 */
export function buildStoreScopeAliasKeys(
  storeCode: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): string[] {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const keys = new Set<string>([code])
  const master =
    findErpStoreMasterForScopeKey(code, masters, legacyToCanonical) ||
    (masters || []).find((row) => String(row.store_code || '').trim() === code) ||
    null
  if (master) {
    const sc = String(master.store_code || '').trim()
    if (sc) keys.add(sc)
    const dn = String(master.display_name || '').trim()
    if (dn) keys.add(dn)
    for (const alias of master.aliases || []) {
      const a = String(alias || '').trim()
      if (a) keys.add(a)
    }
  }
  const canonical = canonicalizeStoreName(code, legacyToCanonical)
  if (canonical) keys.add(canonical)
  for (const [legacy, canon] of Object.entries(legacyToCanonical || {})) {
    const canonCode = String(canon || '').trim()
    if (!canonCode) continue
    if (canonCode === code || (canonical && canonCode === canonical)) {
      const leg = String(legacy || '').trim()
      if (leg) keys.add(leg)
    }
  }
  return Array.from(keys)
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
  let masters: ErpStoreMasterRow[] = []
  try {
    masters = await fetchErpStoresMaster()
    legacyToCanonical = buildLegacyToCanonicalMap(masters || [])
  } catch {
    legacyToCanonical = {}
    masters = []
  }

  const requestedCanonical = canonicalizeStoreName(requested, legacyToCanonical)
  const master = findErpStoreMasterForScopeKey(requested, masters, legacyToCanonical)
  const scopeStoreCode = String(master?.store_code || requestedCanonical || requested).trim()
  const aliasKeys = buildStoreScopeAliasKeys(scopeStoreCode || requested, masters, legacyToCanonical)

  return {
    requested,
    requestedCanonical: scopeStoreCode || requestedCanonical,
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
      for (const key of aliasKeys) {
        if (storesMatchForGradeLookup(rowStore, key)) return true
      }
      return false
    },
  }
}
