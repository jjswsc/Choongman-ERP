import type { JwtPayload } from '@/lib/jwt-auth'
import {
  pickFranchiseePosSalesStoreCodes,
  normalizedAllowedStoresFromJwt,
} from '@/lib/franchisee-multi-store'
import {
  canSelectAllStoresForPosSalesManagement,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
} from '@/lib/permissions'
import { storeMatches } from '@/lib/admin-employee-store-access'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { getVerifiedAuth } from '@/lib/verify-auth'
import type { NextRequest } from 'next/server'

function managerAllowedStores(auth: JwtPayload): string[] {
  const primary = String(auth.store || '').trim()
  const extra = normalizedAllowedStoresFromJwt(auth)
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of [...extra, primary]) {
    const x = String(s || '').trim()
    if (!x || seen.has(x)) continue
    seen.add(x)
    out.push(x)
  }
  return filterPosSalesStoreOptionsForManagement(out)
}

/**
 * POS 매출 API store 목록 — JWT 역할별 클램프.
 * - 본사·회계: 빈 요청 = 전 매장(빈 배열 반환)
 * - 가맹 복수 매장: 빈 요청 = 허용 매장 전부, 요청 = 허용 ∩ 요청
 * - 매장 매니저: 소속(·허용) 매장만
 */
export function resolvePosSalesStoresForAuth(
  auth: JwtPayload | null,
  requestedStores: string[]
): string[] {
  const requested = requestedStores.map((s) => String(s || '').trim()).filter(Boolean)

  if (!auth) return requested

  const role = String(auth.role || '').trim()
  const userStore = String(auth.store || '').trim()

  if (canSelectAllStoresForPosSalesManagement(role, userStore)) {
    return requested
  }

  if (isFranchiseeRole(role)) {
    return pickFranchiseePosSalesStoreCodes(auth, requested)
  }

  if (isManagerRole(role) || isOfficeRole(role)) {
    const allowed = managerAllowedStores(auth)
    if (allowed.length === 0) return requested.length ? [] : userStore ? [userStore] : []
    if (requested.length === 0) return allowed.length === 1 ? allowed : allowed
    const picked = requested.filter((s) => allowed.some((a) => storeMatches(a, s)))
    return picked.length > 0 ? picked : allowed
  }

  if (requested.length > 0) return requested
  return userStore ? [userStore] : []
}

export async function resolvePosSalesStoresFromRequest(
  request: NextRequest,
  requestedStores: string[]
): Promise<string[]> {
  const auth = await getVerifiedAuth(request)
  return resolvePosSalesStoresForAuth(auth, requestedStores)
}
