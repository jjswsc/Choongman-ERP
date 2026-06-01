/**
 * POS store_code 조회 후보 — getPosOrders·매출 API 공통.
 * erp_stores 별칭(태국어·에까마이 등)·Grab 연동 ID까지 펼침.
 */
import { supabaseSelect } from '@/lib/supabase-server'
import { buildLegacyToCanonicalMap, fetchErpStoresMaster, type ErpStoreMasterRow } from '@/lib/erp-store-master'
import { expandGrabStoreMapLinkedCodes, parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { normStoreKey } from '@/lib/store-list-keys'

type GrabIntegrationRow = {
  grab_merchant_id?: string
  partner_merchant_id?: string
  integration_status?: string
}

export function addPosStoreCodeVariants(set: Set<string>, raw: string) {
  const v = String(raw || '').trim()
  if (!v || v.toLowerCase() === 'all') return
  set.add(v)
  const partnerStripped = v.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (partnerStripped && partnerStripped !== v) set.add(partnerStripped)
  const numeric = (partnerStripped || v).match(/\b(\d{3,6})\b/)?.[1] || ''
  if (numeric) set.add(numeric)
  const prefixed = v.startsWith('CM ') ? v.slice(3).trim() : `CM ${v}`.trim()
  if (prefixed && prefixed !== v) set.add(prefixed)
  const noPrefix = v.replace(/^CM\s+/i, '').trim()
  if (noPrefix && noPrefix !== v) set.add(noPrefix)
}

function addMasterRowVariants(
  set: Set<string>,
  row: { store_code?: string; display_name?: string; aliases?: string[] | null }
) {
  addPosStoreCodeVariants(set, String(row.store_code || ''))
  addPosStoreCodeVariants(set, String(row.display_name || ''))
  for (const alias of row.aliases || []) {
    addPosStoreCodeVariants(set, String(alias || ''))
  }
}

function masterRowMatchesScopeKeys(
  row: ErpStoreMasterRow,
  baseKey: string,
  canonicalKey: string
): boolean {
  const keys = [
    String(row.store_code || '').trim(),
    String(row.display_name || '').trim(),
    ...((row.aliases || []).map((a) => String(a || '').trim())),
  ]
  return keys.some((k) => {
    const nk = normStoreKey(k)
    return Boolean(nk && (nk === baseKey || (canonicalKey && nk === canonicalKey)))
  })
}

/** 단일 매장 키 → pos_orders.store_code 후보 (erp_stores·Grab 연동 포함) */
export async function resolvePosStoreFilterCandidates(rawStore: string): Promise<string[]> {
  const base = String(rawStore || '').trim()
  if (!base || base.toLowerCase() === 'all') return []
  const variants = new Set<string>()
  addPosStoreCodeVariants(variants, base)

  let masters: ErpStoreMasterRow[] = []
  try {
    masters = await fetchErpStoresMaster()
    if (masters.length > 0) {
      const legacyToCanonical = buildLegacyToCanonicalMap(masters)
      const canonical = String(legacyToCanonical[normStoreKey(base)] || '').trim()
      if (canonical) addPosStoreCodeVariants(variants, canonical)
      const baseKey = normStoreKey(base)
      const canonicalKey = normStoreKey(canonical)
      for (const row of masters) {
        if (masterRowMatchesScopeKeys(row, baseKey, canonicalKey)) {
          addMasterRowVariants(variants, row)
        }
      }
    }
  } catch {
    // erp_stores 미배포 시 CM 접두 변형만 사용
  }

  let integrationRows: GrabIntegrationRow[] = []
  try {
    integrationRows = (await supabaseSelect('pos_grab_store_integrations', {
      order: 'updated_at.desc',
      limit: 500,
      select: 'grab_merchant_id,partner_merchant_id,integration_status',
    })) as GrabIntegrationRow[]
  } catch {
    integrationRows = []
  }

  const grabMap = parseGrabStoreMap()
  const legacyToCanonical = masters.length ? buildLegacyToCanonicalMap(masters) : {}
  const baseKey = normStoreKey(base)
  const canonical = String(legacyToCanonical[baseKey] || '').trim()
  const canonicalKey = normStoreKey(canonical)

  for (const row of integrationRows || []) {
    const status = String(row.integration_status || '').trim().toLowerCase()
    if (status && status !== 'active') continue
    const G = String(row.grab_merchant_id || '').trim()
    const P = String(row.partner_merchant_id || '').trim()
    if (!G || !P) continue
    const mapped = String(grabMap[G] || '').trim()
    if (!mapped || normStoreKey(mapped) !== normStoreKey(P)) continue
    for (const m of masters) {
      if (!masterRowMatchesScopeKeys(m, baseKey, canonicalKey)) continue
      const sc = String(m.store_code || '').trim()
      if (normStoreKey(sc) === normStoreKey(P) || normStoreKey(sc) === normStoreKey(mapped)) {
        addPosStoreCodeVariants(variants, G)
        addPosStoreCodeVariants(variants, P)
        addPosStoreCodeVariants(variants, mapped)
        break
      }
    }
  }

  for (let iter = 0; iter < 6; iter++) {
    const size0 = variants.size
    const variantKeys = new Set(Array.from(variants).map((v) => normStoreKey(v)).filter(Boolean))
    for (const row of integrationRows || []) {
      const status = String(row.integration_status || '').trim().toLowerCase()
      if (status && status !== 'active') continue
      const partnerId = String(row.partner_merchant_id || '').trim()
      const partnerKey = normStoreKey(partnerId)
      if (!partnerKey || !variantKeys.has(partnerKey)) continue
      addPosStoreCodeVariants(variants, partnerId)
      addPosStoreCodeVariants(variants, String(row.grab_merchant_id || ''))
    }
    for (const x of expandGrabStoreMapLinkedCodes(Array.from(variants))) {
      addPosStoreCodeVariants(variants, x)
    }
    if (variants.size === size0) break
  }

  return Array.from(variants)
}

/** 복수 매장 UI 코드 → DISTINCT store_code 후보 */
export async function resolvePosStoreFilterCandidatesMany(stores: string[]): Promise<string[]> {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of stores) {
    for (const v of await resolvePosStoreFilterCandidates(s)) {
      const t = String(v || '').trim()
      if (!t) continue
      const k = t.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(t)
    }
  }
  return out
}
