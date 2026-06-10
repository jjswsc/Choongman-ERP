/**
 * POS 단말·Realtime — pos_orders.store_code 매칭 후보.
 * getPosOrders(resolvePosStoreFilterCandidates)와 동일하게 legacy·표시명까지 펼친다.
 * (예: 태블릿 1042 ↔ Grab 저장 CM Silom)
 */
import { addPosStoreCodeVariants } from '@/lib/pos-store-code-variants'
import { normStoreKey, resolveStoreListKey } from '@/lib/store-list-keys'

export type BuildPosStoreCodeMatchVariantsParams = {
  storeCode: string
  catalogStoreCodes?: string[]
  legacyToCanonical?: Record<string, string>
  storeLabels?: Record<string, string>
}

function addVariantsToSet(set: Set<string>, raw: string) {
  const bucket = new Set<string>()
  addPosStoreCodeVariants(bucket, raw)
  for (const v of bucket) set.add(v)
}

/** 대소문자 무시 dedupe, 첫 등장 순서 유지 */
export function dedupeStoreCodeVariants(values: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const v = String(raw || '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export function buildPosStoreCodeMatchVariants(params: BuildPosStoreCodeMatchVariantsParams): string[] {
  const base = String(params.storeCode || '').trim()
  if (!base) return []

  const legacy = params.legacyToCanonical ?? {}
  const catalog = params.catalogStoreCodes ?? []
  const labels = params.storeLabels ?? {}

  const variantSet = new Set<string>()
  addVariantsToSet(variantSet, base)

  const canonical = resolveStoreListKey(base, catalog, legacy)
  if (canonical) addVariantsToSet(variantSet, canonical)

  const scopeKeys = new Set<string>()
  for (const k of [base, canonical]) {
    const nk = normStoreKey(k)
    if (nk) scopeKeys.add(nk)
  }

  for (const [legacyKey, canonVal] of Object.entries(legacy)) {
    const valKey = normStoreKey(String(canonVal ?? ''))
    const keyNorm = normStoreKey(legacyKey)
    if (!scopeKeys.has(valKey) && !scopeKeys.has(keyNorm)) continue
    addVariantsToSet(variantSet, String(canonVal ?? ''))
    addVariantsToSet(variantSet, legacyKey)
  }

  for (const [code, label] of Object.entries(labels)) {
    const codeKey = normStoreKey(code)
    const labelKey = normStoreKey(label)
    if (!scopeKeys.has(codeKey) && !scopeKeys.has(labelKey)) continue
    addVariantsToSet(variantSet, code)
    addVariantsToSet(variantSet, label)
  }

  return dedupeStoreCodeVariants(variantSet)
}

export function posStoreCodeMatchesVariants(
  rawStoreCode: unknown,
  variants: readonly string[]
): boolean {
  const rowStore = String(rawStoreCode ?? '').trim()
  if (!rowStore || variants.length === 0) return false
  const rowKey = rowStore.toLowerCase()
  return variants.some((v) => v && v.toLowerCase() === rowKey)
}
