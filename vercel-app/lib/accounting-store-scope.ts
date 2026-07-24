import { type ErpStoreMasterRow } from '@/lib/erp-store-master'
import {
  findErpStoreMasterForScopeKey,
  resolveErpStoreIdentitySync,
} from '@/lib/erp-store-identity'
import { ensureErpStoreMatchIndex } from '@/lib/accounting-store-match'
import { matchesAccountingStoreScopeRow } from '@/lib/accounting-store-row-match'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { canFranchiseeAggregateAllowedStores } from '@/lib/franchisee-multi-store'
import { isAccountingRole, isFranchiseeRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import {
  FINANCIAL_STATEMENT_STORE_NONE,
  isFinancialStatementStoreNone,
} from '@/lib/financial-statement-store-options'
import { addStoreNameAliasVariants, normStoreKey } from '@/lib/store-list-keys'
import {
  CANONICAL_OFFICE_STORE,
  isOfficeStoreVariant,
  OFFICE_INBOUND_LOCATION_VALUES,
} from '@/lib/office-store-canonical'
import { listHeadOfficeCounterpartyLabels } from '@/lib/head-office-counterparty-labels'

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
  /** Omni JWT tenantId */
  tenantId?: string
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

/** 가맹 복수 매장 — 재무제표에서 All = 허용 매장 합산(본사 전 네트워크와 별도) */
export function resolveFranchiseeAccountingAllowedStoresOnly(
  auth: AccountingStoreAuthScope
): string[] | undefined {
  if (!isFranchiseeRole(String(auth.userRole || ''))) return undefined
  const allowed = collectAccountingAllowedStores(auth)
  if (!canFranchiseeAggregateAllowedStores(auth.userRole, auth.allowedStores, auth.userStore)) {
    return undefined
  }
  return allowed.length > 1 ? allowed : undefined
}

/**
 * 재무제표·시산 등 storeFilter 확정 (세무 원장 API와 동일 규칙).
 * 가맹 복수 매장: All/미지정 → All(허용 매장 합산). 단일 허용만 있으면 그 매장.
 */
/** 쉼표 구분 복수 매장 — All·단일 특수값이 아닐 때만 */
export function parseCommaSeparatedStoreFilter(raw: string | undefined | null): string[] | null {
  const s = String(raw || '').trim()
  if (!s || s === 'All' || s === '전체' || s === '*') return null
  if (!s.includes(',')) return null
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of s.split(',')) {
    const v = String(part || '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out.length > 0 ? out : null
}

export function validateAccountingStoreSelection(
  stores: string[],
  auth: AccountingStoreAuthScope
): void {
  for (const store of stores) {
    if (isOfficeStore(store) || isHeadOfficeLikeStoreName(store)) {
      throw new AccountingStoreScopeForbidden()
    }
    if (canAccessAllAccountingStores(auth)) continue
    const allowedStores = collectAccountingAllowedStores(auth)
    const ok = allowedStores.some((s) => storesMatchForGradeLookup(s, store))
    if (!ok) throw new AccountingStoreScopeForbidden()
  }
}

export function resolveAccountingStoreFilterFromAuth(
  requestedStoreFilter: string | undefined | null,
  auth: AccountingStoreAuthScope
): string {
  const requested = String(requestedStoreFilter || '').trim()
  if (isFinancialStatementStoreNone(requested)) {
    return FINANCIAL_STATEMENT_STORE_NONE
  }
  const allowedStores = collectAccountingAllowedStores(auth)
  const multi = parseCommaSeparatedStoreFilter(requested)
  if (multi) {
    if (multi.length === 1) return multi[0]!
    validateAccountingStoreSelection(multi, auth)
    return multi.join(',')
  }

  if (canAccessAllAccountingStores(auth)) {
    if (requested && requested !== 'All' && requested !== '전체' && requested !== '*') {
      /** 손익 본사(isHQ): 「본사」를 All로 바꾸지 않음 — 가맹용 창고 출고(매입) 합산이 매입에 들어가 이중·과대 집계됨 */
      return requested
    }
    return requested || 'All'
  }

  const franchiseAll = resolveFranchiseeAccountingAllowedStoresOnly(auth)
  if (franchiseAll?.length) {
    if (!requested || requested === 'All' || requested === '전체' || requested === '*') {
      return 'All'
    }
    const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requested))
    if (!allowed) throw new AccountingStoreScopeForbidden()
    return requested
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

export type AccountingIncomeScopeStores = {
  storeFilter: string
  allowedStoresOnly?: string[]
  selectedStoresOnly?: string[]
}

/** per-store fetch 후 merge — 가맹 All 또는 명시 복수 선택 */
export function resolveAccountingRollupStores(scope: AccountingIncomeScopeStores): string[] | undefined {
  if (scope.selectedStoresOnly && scope.selectedStoresOnly.length > 1) {
    return scope.selectedStoresOnly
  }
  if (scope.allowedStoresOnly && scope.allowedStoresOnly.length > 1) {
    return scope.allowedStoresOnly
  }
  return undefined
}

/** POS·경영손익 등 storeCodes 파라미터 */
export function resolvePosStoreCodesForAccountingScope(scope: AccountingIncomeScopeStores): string[] | undefined {
  if (scope.selectedStoresOnly?.length) return scope.selectedStoresOnly
  if (scope.storeFilter === 'All') {
    return scope.allowedStoresOnly?.length ? scope.allowedStoresOnly : undefined
  }
  const multi = parseCommaSeparatedStoreFilter(scope.storeFilter)
  if (multi?.length) return multi
  const single = String(scope.storeFilter || '').trim()
  if (!single || single === 'All') return undefined
  return [single]
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
      dbStoreNameValues: [] as string[],
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
  const aliasKeys = buildStoreScopeAliasKeys(scopeStoreCode || requested, masters, legacyToCanonical)
  /** PostgREST store_name=in.(...) 용 — 표시명·코드·별칭 */
  const dbStoreNameValues = Array.from(
    new Set(
      [requested, scopeStoreCode, scopeIdentity.displayName, ...aliasKeys]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    )
  )
  // 본사 선택 시 창고 location「입고등록」등으로 저장된 매입 원장도 조회에 포함
  if (isOfficeStoreVariant(requested) || isOfficeStoreVariant(scopeIdentity.displayName) || isOfficeStore(requested)) {
    dbStoreNameValues.push(CANONICAL_OFFICE_STORE)
    for (const v of OFFICE_INBOUND_LOCATION_VALUES) {
      const t = String(v || '').trim()
      if (t) dbStoreNameValues.push(t)
    }
    for (const v of listHeadOfficeCounterpartyLabels()) {
      const t = String(v || '').trim()
      if (t) dbStoreNameValues.push(t)
    }
  }

  return {
    requested,
    requestedCanonical: scopeStoreCode,
    dbStoreNameValues: Array.from(new Set(dbStoreNameValues)),
    matches: (storeName: string): boolean =>
      matchesAccountingStoreScopeRow(storeName, requested, masters, legacyToCanonical),
  }
}
