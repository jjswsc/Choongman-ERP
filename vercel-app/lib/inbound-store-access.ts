/**
 * 입고 수정·삭제 범위.
 * 본사·회계는 전 매장. 매장 매니저·가맹점주(각 지점 대리 매니저 포함)는
 * 자기 매장(가맹 복수 매장이면 허용 매장) 입고만 오입력 정정할 수 있다.
 */
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { sameOfficeStoreScope } from '@/lib/office-store-canonical'
import {
  canPickInboundStore,
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
} from '@/lib/permissions'

export type InboundActor = {
  role?: string | null
  store?: string | null
  allowedStores?: string[] | null
}

export function canMutateInboundAcrossStores(role: string, authStore?: string | null): boolean {
  if (canPickInboundStore(role, authStore || '')) return true
  return isAccountingRole(role)
}

/**
 * 자기 매장 입고를 고칠 수 있는 지점 역할.
 * Omni Manager는 ERP에서 Officer로 승격되어 isManagerRole이 false이므로,
 * 브랜드 승격 없이 역할 문자열로 매니저·가맹점주를 본다.
 */
export function isStoreInboundCorrectorRole(role: string): boolean {
  const raw = String(role || '').trim()
  if (!raw) return false
  if (isManagerRole(raw) || isFranchiseeRole(raw)) return true
  const lo = raw.toLowerCase()
  if (lo.includes('manager') || /매니저|점장|지점장|店長|store\s*manager/i.test(raw)) return true
  if (lo.includes('franchisee') || /가맹|프랜차이즈|점주|franchise/i.test(raw)) return true
  return false
}

/** 입고 화면에서 연필·삭제 버튼을 보여줄지 (본사는 전 매장, 지점은 자기 매장 행만 목록에 있음) */
export function canCorrectOwnStoreInbound(role: string, authStore?: string | null): boolean {
  if (canMutateInboundAcrossStores(role, authStore)) return true
  return isStoreInboundCorrectorRole(role)
}

export function inboundLocationAllowedForActor(actor: InboundActor, location: string | null | undefined): boolean {
  const role = String(actor.role || '')
  if (canMutateInboundAcrossStores(role, actor.store)) return true
  if (!isStoreInboundCorrectorRole(role)) return false
  const loc = String(location || '').trim()
  if (!loc) return false
  const candidates = [
    ...(Array.isArray(actor.allowedStores) ? actor.allowedStores : []),
    String(actor.store || '').trim(),
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  return candidates.some((s) => storesMatchForGradeLookup(s, loc) || sameOfficeStoreScope(s, loc))
}

export function authorizeInboundBatchMutation(
  actor: InboundActor | null,
  location: string | null | undefined
): { ok: true } | { ok: false; status: 401 | 403; message: string } {
  if (!actor || !String(actor.role || '').trim()) {
    return { ok: false, status: 401, message: '로그인이 필요합니다.' }
  }
  if (!inboundLocationAllowedForActor(actor, location)) {
    return { ok: false, status: 403, message: '이 매장 입고는 수정할 수 없습니다.' }
  }
  return { ok: true }
}
