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
