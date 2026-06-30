import 'server-only'

import { resolvePosStoreFilterCandidates } from '@/lib/pos-store-filter-candidates'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  hasOfficeStaffScope,
  isAccountingRole,
  isOfficeRole,
} from '@/lib/permissions'
import type { JwtPayload } from '@/lib/jwt-auth'
import { normStoreKey } from '@/lib/store-list-keys'

function normKeys(values: string[]): Set<string> {
  const out = new Set<string>()
  for (const v of values) {
    const k = normStoreKey(String(v || '').trim())
    if (k) out.add(k)
  }
  return out
}

/** JWT employees.store(표시명) ↔ POS store_code(erp_stores·SaaS synthetic) 동일 매장 여부 */
export async function posStoreCodesReferToSameStore(a: string, b: string): Promise<boolean> {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left || !right) return false
  if (left === right) return true
  const lk = normStoreKey(left)
  const rk = normStoreKey(right)
  if (lk && rk && lk === rk) return true

  const [leftCandidates, rightCandidates] = await Promise.all([
    resolvePosStoreFilterCandidates(left),
    resolvePosStoreFilterCandidates(right),
  ])
  const leftKeys = normKeys([left, ...leftCandidates])
  for (const c of rightCandidates) {
    const k = normStoreKey(c)
    if (k && leftKeys.has(k)) return true
  }
  const rightKeys = normKeys([right, ...rightCandidates])
  for (const k of leftKeys) {
    if (rightKeys.has(k)) return true
  }
  return false
}

export async function canAccessPosStoreForAuth(authStore: string, targetStoreCode: string): Promise<boolean> {
  const auth = String(authStore || '').trim()
  const target = String(targetStoreCode || '').trim()
  if (!target) return false
  if (!auth) return true
  return posStoreCodesReferToSameStore(auth, target)
}

/** POS 주문·결산 등 쓰기 API — JWT 매장·allowedStores·본사 권한으로 대상 매장 접근 허용 여부 */
export async function authCanAccessPosStoreWrite(
  auth: JwtPayload,
  targetStoreCode: string
): Promise<boolean> {
  const target = String(targetStoreCode || '').trim()
  if (!target) return false
  const role = String(auth.role || '')
  const authStore = String(auth.store || '').trim()
  if (hasOfficeStaffScope(role, authStore) || isOfficeRole(role) || isAccountingRole(role.toLowerCase())) {
    return true
  }
  const candidates = [
    authStore,
    ...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []).map((s) => String(s || '').trim()),
  ].filter(Boolean)
  if (candidates.length === 0) return false
  for (const candidate of candidates) {
    if (storesMatchForGradeLookup(candidate, target)) return true
    if (await posStoreCodesReferToSameStore(candidate, target)) return true
  }
  return false
}
