import 'server-only'

import { resolvePosStoreFilterCandidates } from '@/lib/pos-store-filter-candidates'
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
