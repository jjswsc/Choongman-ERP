import { storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'

export function normalizeMenuScopeStoreCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const code = String(v || '').trim()
    if (!code) continue
    if (out.some((x) => x.toLowerCase() === code.toLowerCase())) continue
    out.push(code)
  }
  return out
}

export function menuScopeIncludesStore(scopedStores: string[], requestedStoreCode: string): boolean {
  const selected = String(requestedStoreCode || '').trim()
  if (!selected) return false
  const normalizedForms = (raw: string): string[] => {
    const base = String(raw || '').trim()
    if (!base) return []
    const out = new Set<string>()
    const push = (v: string) => {
      const t = String(v || '').trim().toLowerCase()
      if (!t) return
      out.add(t)
      // 구분자 차이(CM-MBK / CM MBK / cm_mbk)까지 동일 매장으로 처리
      out.add(t.replace(/[\s\-_]+/g, ''))
    }
    push(base)
    for (const v of storeCodeSearchVariants(base)) push(v)
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

/** 서버 기본값(POS_MENU_SCOPE_COMPATIBILITY_MODE=1)과 동일 — 클라이언트 표시용 */
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
