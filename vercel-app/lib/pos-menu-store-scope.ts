import { storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'
import {
  sanitizeMenuScopeStoreCodes,
  storeCodeIdentityForms,
} from '@/lib/pos-operating-store-code'

export function normalizeMenuScopeStoreCodes(raw: unknown): string[] {
  return sanitizeMenuScopeStoreCodes(raw)
}

export function menuScopeIncludesStore(scopedStores: string[], requestedStoreCode: string): boolean {
  const selected = String(requestedStoreCode || '').trim()
  if (!selected) return false
  const normalizedForms = (raw: string): string[] => {
    const out = new Set<string>()
    const push = (v: string) => {
      const t = String(v || '').trim().toLowerCase()
      if (!t) return
      out.add(t)
      // 구분자 차이(CM-MBK / CM MBK / cm_mbk)까지 동일 매장으로 처리
      out.add(t.replace(/[\s\-_]+/g, ''))
    }
    for (const identity of storeCodeIdentityForms(raw)) {
      push(identity)
      for (const v of storeCodeSearchVariants(identity)) push(v)
    }
    return Array.from(out)
  }

  const selectedSet = new Set(normalizedForms(selected))
  return scopedStores.some((x) => {
    const candidateForms = normalizedForms(String(x || ''))
    return candidateForms.some((v) => selectedSet.has(v))
  })
}

export function shouldMenuBeVisibleForStore(params: {
  requestedStoreCode: string
  scopedStores: string[]
  compatibilityMode: boolean
  scopeSchemaReady: boolean
}): boolean {
  const requested = String(params.requestedStoreCode || '').trim()
  if (!requested) return true
  if (!params.scopeSchemaReady) return true
  if (menuScopeIncludesStore(params.scopedStores, requested)) return true
  if (params.compatibilityMode && params.scopedStores.length === 0) return true
  return false
}

/** 서버 기본값(POS_MENU_SCOPE_COMPATIBILITY_MODE=1)과 동일 — 충만(레거시) 클라이언트 표시용 */
export function isPosMenuScopeCompatibilityModeEnabled(): boolean {
  if (typeof process !== 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_POS_MENU_SCOPE_COMPATIBILITY_MODE ??
      process.env.POS_MENU_SCOPE_COMPATIBILITY_MODE ??
      '1'
    return String(raw) !== '0'
  }
  return true
}

/**
 * Omni(SaaS)는 getPosMenus에서 tenant enforce → 빈 매장 스코프 = POS 미노출.
 * 관리 UI도 서버와 같이 “호환(전 매장)”이 아니라 엄격 모드로 다룬다.
 */
export function isPosMenuStoreScopeCompatibilityModeForBrand(
  brandKey?: string | null
): boolean {
  if (String(brandKey || '').trim().toLowerCase() === 'omnifoodtech') return false
  return isPosMenuScopeCompatibilityModeEnabled()
}

export function menuHasPersistedStoreScope(scopedStores: unknown): boolean {
  return normalizeMenuScopeStoreCodes(scopedStores).length > 0
}

/** DB 스코프가 비어 있고 호환 모드면 전 매장 노출로 간주(관리 UI 표시용) */
export function resolveEffectiveMenuScopeStoreCodes(
  scopedStores: unknown,
  allStoreCodes: string[],
  compatibilityMode: boolean = isPosMenuScopeCompatibilityModeEnabled()
): string[] {
  const persisted = normalizeMenuScopeStoreCodes(scopedStores)
  if (persisted.length > 0) return persisted
  if (compatibilityMode) return normalizeMenuScopeStoreCodes(allStoreCodes)
  return []
}
