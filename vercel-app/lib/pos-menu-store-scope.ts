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
  const variants = new Set(storeCodeSearchVariants(selected).map((x) => x.toLowerCase()))
  return scopedStores.some((x) => variants.has(String(x || '').trim().toLowerCase()))
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
