import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { normStoreKey } from '@/lib/store-list-keys'
import type { StoreListBuildResult } from '@/lib/erp-store-master'

function looksLikeErpStoreLabel(s: string): boolean {
  const t = String(s || '').trim()
  if (!t) return false
  if (/^cm\s+/i.test(t)) return true
  return !/^\d{3,6}$/.test(t)
}

function pickCanonicalStoreCode(
  a: string,
  b: string,
  storesSet: Set<string>
): string {
  if (storesSet.has(b) && looksLikeErpStoreLabel(b)) return b
  if (storesSet.has(a) && looksLikeErpStoreLabel(a)) return a
  if (storesSet.has(b)) return b
  if (storesSet.has(a)) return a
  if (looksLikeErpStoreLabel(b)) return b
  if (looksLikeErpStoreLabel(a)) return a
  return b || a
}

/**
 * GRAB_STORE_MAP_JSON·GRAB_PORTAL_MERCHANT_MAP의 K↔V를 legacyToCanonical·storeLabels에 반영.
 * 예: `"1042":"CM Silom"` → 1042 표시명·집계 키를 CM Silom(또는 마스터 store_code)으로 통일.
 */
export function enrichStoreListWithGrabMap(built: StoreListBuildResult): StoreListBuildResult {
  const map = parseGrabStoreMap()
  if (!Object.keys(map).length) return built

  const storesSet = new Set(built.stores.map((s) => String(s || '').trim()).filter(Boolean))
  const legacyToCanonical = { ...built.legacyToCanonical }
  const storeLabels = { ...built.storeLabels }

  for (const [rawK, rawV] of Object.entries(map)) {
    const k = String(rawK || '').trim()
    const v = String(rawV || '').trim()
    if (!k || !v || k === v) continue

    const canon = pickCanonicalStoreCode(k, v, storesSet)
    const display =
      (looksLikeErpStoreLabel(v) ? v : null) ||
      (looksLikeErpStoreLabel(k) ? k : null) ||
      storeLabels[canon] ||
      canon

    for (const alias of [k, v]) {
      const nk = normStoreKey(alias)
      if (!nk || nk === normStoreKey(canon)) continue
      legacyToCanonical[nk] = canon
      if (storesSet.has(alias)) {
        const cur = storeLabels[alias]
        if (!cur || cur === alias) storeLabels[alias] = display
      }
    }
    if (storesSet.has(canon) && (!storeLabels[canon] || storeLabels[canon] === canon)) {
      storeLabels[canon] = display
    }
  }

  return { ...built, legacyToCanonical, storeLabels }
}
