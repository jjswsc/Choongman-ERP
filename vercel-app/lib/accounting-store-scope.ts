import { type ErpStoreMasterRow } from '@/lib/erp-store-master'
import {
  findErpStoreMasterForScopeKey,
  resolveErpStoreIdentitySync,
} from '@/lib/erp-store-identity'
import { ensureErpStoreMatchIndex } from '@/lib/accounting-store-match'
import { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { addStoreNameAliasVariants, normStoreKey } from '@/lib/store-list-keys'

export { findErpStoreMasterForScopeKey } from '@/lib/erp-store-identity'

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

/** store_code 기준 display_name·별칭·레거시 키 — VAT 원장 store_name(표시명·location) 매칭용 */
export function buildStoreScopeAliasKeys(
  storeCode: string,
  masters: ErpStoreMasterRow[],
  legacyToCanonical: Record<string, string>
): string[] {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const keys = new Set<string>()
  addStoreNameAliasVariants(keys, code)
  const master =
    findErpStoreMasterForScopeKey(code, masters, legacyToCanonical) ||
    (masters || []).find((row) => String(row.store_code || '').trim() === code) ||
    null
  if (master) {
    addStoreNameAliasVariants(keys, String(master.store_code || '').trim())
    addStoreNameAliasVariants(keys, String(master.display_name || '').trim())
    for (const alias of master.aliases || []) {
      addStoreNameAliasVariants(keys, String(alias || '').trim())
    }
  }
  const canonical = canonicalizeStoreName(code, legacyToCanonical)
  if (canonical) addStoreNameAliasVariants(keys, canonical)
  for (const [legacy, canon] of Object.entries(legacyToCanonical || {})) {
    const canonCode = String(canon || '').trim()
    if (!canonCode) continue
    if (canonCode === code || (canonical && canonCode === canonical)) {
      addStoreNameAliasVariants(keys, String(legacy || '').trim())
    }
  }
  return Array.from(keys)
}

export { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'

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
    const index = await ensureErpStoreMatchIndex()
    masters = index.masters
    legacyToCanonical = index.legacyToCanonical
  } catch {
    legacyToCanonical = {}
    masters = []
  }

  const scopeIdentity = resolveErpStoreIdentitySync(requested, masters, legacyToCanonical)
  const scopeStoreCode = scopeIdentity.storeCode

  return {
    requested,
    requestedCanonical: scopeStoreCode,
    matches: (storeName: string): boolean =>
      matchesAccountingStoreScopeRow(storeName, requested, masters, legacyToCanonical),
  }
}
