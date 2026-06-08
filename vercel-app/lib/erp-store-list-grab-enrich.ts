import {
  buildLegacyToCanonicalMap,
  storeLabelsFromMasters,
  type ErpStoreMasterRow,
  type StoreListBuildResult,
} from '@/lib/erp-store-master-shared'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { normStoreKey } from '@/lib/store-list-keys'

function looksLikeErpStoreLabel(s: string): boolean {
  const t = String(s || '').trim()
  if (!t) return false
  if (/^cm\s+/i.test(t)) return true
  return !/^\d{3,6}$/.test(t)
}

function isGrabPartnerNumericId(s: string): boolean {
  return /^\d{3,6}$/.test(String(s || '').trim())
}

/** Grab partner store ID → ERP store_code (env 없을 때 erp_stores에 둘 다 있으면 폴백) */
const DEFAULT_GRAB_PARTNER_ERP_PAIRS: Record<string, string> = {
  '1040': 'CM True Digital',
  '1042': 'CM Silom',
  '1043': 'CM Ekkamai',
}

function activeMasterStoreCodes(masters: ErpStoreMasterRow[]): Set<string> {
  const out = new Set<string>()
  for (const row of masters || []) {
    if (row.is_active === false) continue
    const code = String(row.store_code || '').trim()
    if (code) out.add(code)
  }
  return out
}

/** GRAB_STORE_MAP_JSON + 알려진 partner ID(1040 등) — 정식 CM 매장이 마스터에 있을 때만 */
export function buildEffectiveGrabPartnerErpMap(masters: ErpStoreMasterRow[] = []): Record<string, string> {
  const out = { ...parseGrabStoreMap() }
  const active = activeMasterStoreCodes(masters)
  if (!active.size) return out

  for (const [partner, erp] of Object.entries(DEFAULT_GRAB_PARTNER_ERP_PAIRS)) {
    if (out[partner]) continue
    if (active.has(partner) && active.has(erp)) out[partner] = erp
  }
  return out
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

function resolveStoreCanonical(code: string, legacyToCanonical: Record<string, string>): string {
  const t = String(code || '').trim()
  if (!t) return t
  return legacyToCanonical[normStoreKey(t)] ?? t
}

/** 동일 매장의 ERP명·Grab partner ID(1040 등)가 둘 다 있으면 ERP명 하나만 남긴다. */
export function dedupeStoreListByCanonical(built: StoreListBuildResult): StoreListBuildResult {
  const stores = built.stores.map((s) => String(s || '').trim()).filter(Boolean)
  if (stores.length <= 1) return built

  const legacyToCanonical = { ...built.legacyToCanonical }
  const storeLabels = { ...built.storeLabels }
  const users: StoreListBuildResult['users'] = { ...built.users }
  const staffByStore: StoreListBuildResult['staffByStore'] = { ...built.staffByStore }
  const storeSet = new Set(stores)

  const parent = new Map<string, string>()
  for (const s of stores) parent.set(s, s)

  const find = (s: string): string => {
    let p = parent.get(s)!
    if (parent.get(p) !== p) {
      p = find(p)
      parent.set(s, p)
    }
    return p
  }

  const unite = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  const pickPrimary = (members: string[]): string => {
    let best = members[0]
    for (const c of members.slice(1)) {
      const bestNum = isGrabPartnerNumericId(best)
      const cNum = isGrabPartnerNumericId(c)
      if (bestNum && !cNum) {
        best = c
        continue
      }
      if (!bestNum && cNum) continue
      const cmp = (storeLabels[best] || best).localeCompare(storeLabels[c] || c, 'ko', {
        sensitivity: 'base',
      })
      if (cmp > 0) best = c
    }
    return best
  }

  for (const s of stores) {
    const canon = resolveStoreCanonical(s, legacyToCanonical)
    if (canon !== s && storeSet.has(canon)) unite(s, canon)
  }

  /** erp_stores 껍데기: store_code=1040·display_name=CM True Digital 등 동일 표시명 중복 */
  const byDisplayLabel = new Map<string, string[]>()
  for (const s of stores) {
    const label = normStoreKey(storeLabels[s] || '')
    if (!label) continue
    const g = byDisplayLabel.get(label) || []
    g.push(s)
    byDisplayLabel.set(label, g)
  }
  for (const members of byDisplayLabel.values()) {
    if (members.length <= 1) continue
    const primary = pickPrimary(members)
    for (const m of members) {
      if (m !== primary) unite(m, primary)
    }
  }

  const groups = new Map<string, string[]>()
  for (const s of stores) {
    const root = find(s)
    const g = groups.get(root) || []
    g.push(s)
    groups.set(root, g)
  }

  const mergeUserNames = (primary: string, alias: string) => {
    const from = users[alias]
    if (!from?.length) return
    users[primary] = [...new Set([...(users[primary] || []), ...from])]
    delete users[alias]
  }

  const mergeStaff = (primary: string, alias: string) => {
    const from = staffByStore[alias]
    if (!from?.length) return
    const seen = new Set((staffByStore[primary] || []).map((x) => `${x.name}|${x.nick}`))
    const merged = [...(staffByStore[primary] || [])]
    for (const st of from) {
      const key = `${st.name}|${st.nick}`
      if (seen.has(key)) continue
      merged.push(st)
      seen.add(key)
    }
    staffByStore[primary] = merged
    delete staffByStore[alias]
  }

  const newStores: string[] = []
  const orderIndex = new Map(stores.map((s, i) => [s, i]))

  for (const members of groups.values()) {
    const primary = pickPrimary(members)
    newStores.push(primary)
    for (const m of members) {
      if (m === primary) continue
      legacyToCanonical[normStoreKey(m)] = primary
      mergeUserNames(primary, m)
      mergeStaff(primary, m)
      const aliasLabel = storeLabels[m]
      if (aliasLabel && aliasLabel !== m && (!storeLabels[primary] || storeLabels[primary] === primary)) {
        storeLabels[primary] = aliasLabel
      }
    }
  }

  newStores.sort((a, b) => {
    const oa = Math.min(...membersOrder(a, groups, orderIndex))
    const ob = Math.min(...membersOrder(b, groups, orderIndex))
    return oa - ob
  })

  return { ...built, stores: newStores, users, staffByStore, storeLabels, legacyToCanonical }
}

function membersOrder(
  primary: string,
  groups: Map<string, string[]>,
  orderIndex: Map<string, number>
): number[] {
  for (const members of groups.values()) {
    if (members.includes(primary)) {
      return members.map((m) => orderIndex.get(m) ?? 9999)
    }
  }
  return [orderIndex.get(primary) ?? 9999]
}

/**
 * GRAB_STORE_MAP_JSON·GRAB_PORTAL_MERCHANT_MAP의 K↔V를 legacyToCanonical·storeLabels에 반영.
 * 예: `"1042":"CM Silom"` → 1042 표시명·집계 키를 CM Silom(또는 마스터 store_code)으로 통일.
 */
export function enrichStoreListWithGrabMap(
  built: StoreListBuildResult,
  masters: ErpStoreMasterRow[] = []
): StoreListBuildResult {
  const map = buildEffectiveGrabPartnerErpMap(masters)
  if (!Object.keys(map).length) return dedupeStoreListByCanonical(built)

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

  return dedupeStoreListByCanonical({ ...built, legacyToCanonical, storeLabels })
}

/** 매장 선택 UI·매출 필터 — erp_stores 껍데기(1040 등)·Grab 레거시 중복 제거 */
export function dedupeStoreCodesForPicker(
  storeCodes: string[],
  masters: ErpStoreMasterRow[] = []
): string[] {
  const codes = storeCodes.map((s) => String(s || '').trim()).filter(Boolean)
  if (codes.length <= 1) return codes

  const storeLabels: Record<string, string> = { ...storeLabelsFromMasters(masters) }
  for (const c of codes) {
    if (!storeLabels[c]) storeLabels[c] = c
  }

  const built = enrichStoreListWithGrabMap(
    {
      stores: codes,
      users: {},
      staffByStore: {},
      storeLabels,
      legacyToCanonical: buildLegacyToCanonicalMap(masters),
      usedMaster: masters.length > 0,
    },
    masters
  )
  return filterPosSalesStoreOptionsForManagement(built.stores)
}
