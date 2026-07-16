import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import {
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
  isOfficeStore,
} from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/**
 * 회계 PO 발행 주체 매장.
 * - null/빈값: 본사(S&J) 발행 (기존 로열티·GP 청구)
 * - 매장명: 해당 매장이 청구서 발행 (매장 로그인)
 */
export function resolvePoIssuerStoreFromAuth(params: {
  role: string
  store: string
}): string | null {
  const role = String(params.role || '').trim()
  const store = String(params.store || '').trim()
  if (!store) return null
  if (isOfficeRole(role) || isAccountingRole(role)) return null
  if (isOfficeStore(store) || isHeadOfficeLikeStoreName(store)) return null
  if (isManagerRole(role) || isFranchiseeRole(role)) return store
  return null
}

export function isStoreIssuedAccountingPo(issuerStore: string | null | undefined): boolean {
  return Boolean(String(issuerStore ?? '').trim())
}

export function poIssuerStoreMatchesAuth(
  issuerStore: string | null | undefined,
  authStore: string
): boolean {
  const issuer = String(issuerStore ?? '').trim()
  const store = String(authStore ?? '').trim()
  if (!issuer || !store) return false
  return storesMatchForGradeLookup(issuer, store)
}

/** scoped 사용자가 이 PO를 조회·발행할 수 있는지 */
export function canAccessAccountingPoForAuth(params: {
  role: string
  store: string
  issuerStore?: string | null
  relatedStore?: string | null
}): boolean {
  const authIssuer = resolvePoIssuerStoreFromAuth({ role: params.role, store: params.store })
  const metaIssuer = String(params.issuerStore ?? '').trim()
  const related = String(params.relatedStore ?? '').trim()

  if (!authIssuer) return true

  if (metaIssuer) {
    return poIssuerStoreMatchesAuth(metaIssuer, authIssuer)
  }

  // 레거시 본사 발주: 매장 사용자는 청구 대상(relatedStore)이 자기 매장인 것만
  if (related) {
    return storesMatchForGradeLookup(related, authIssuer)
  }
  return false
}
