import {
  expandGrabStoreMapLinkedCodes,
  parseGrabPartnerApiMenuMerchantMap,
  parseGrabPortalMerchantMap,
  parseGrabStoreMap,
} from '@/lib/grab-store-map-env'
import { normStoreKey } from '@/lib/store-list-keys'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** Grab Partner API (sandbox·legacy) — `GFSBPOS-…` */
export function isGrabPartnerApiMerchantId(k: string): boolean {
  const s = String(k || '').trim()
  if (!s || /^\d{1,6}$/.test(s)) return false
  return /GF/i.test(s)
}

/** Grab 포털 merchantID — Prod 매장·주문 (`3-C6DWPB4VCKK1GT`). True Digital 등 production menu/campaign API 대상 */
export function isGrabPortalMerchantMapKey(k: string): boolean {
  const s = String(k || '').trim()
  if (!s || /^\d{1,6}$/.test(s)) return false
  return /^\d+-[A-Z0-9]+$/i.test(s)
}

/**
 * Grab merchantID 맵 키 (Partner API + 포털).
 * 파트너 스토어 숫자(1040)·ERP store_code는 제외.
 */
export function isGrabFoodMerchantMapKey(k: string): boolean {
  return isGrabMenuSyncMerchantId(k)
}

/** 메뉴 알림·캠페인·updateMenuRecord — Prod `3-…` 또는 sandbox `GFSBPOS-…` */
export function isGrabMenuSyncMerchantId(k: string): boolean {
  return isGrabPartnerApiMerchantId(k) || isGrabPortalMerchantMapKey(k)
}

/** Grab 파트너 스토어 ID(숫자 문자열) 후보 — ERP store_code·표시명도 입력될 수 있음 */
export function collectGrabPartnerStoreIds(partnerParam: string, map: Record<string, string>): Set<string> {
  const raw = String(partnerParam || '').trim()
  const ids = new Set<string>()
  if (!raw) return ids
  if (/^\d{1,6}$/.test(raw)) ids.add(raw)
  for (const [k, v] of Object.entries(map)) {
    const kk = String(k || '').trim()
    const vv = String(v || '').trim()
    if (!kk || !vv) continue
    if (/^\d{1,6}$/.test(kk) && vv === raw) ids.add(kk)
  }
  return ids
}

function resolvePartnerApiMenuMerchantOverride(rawInput: string): string | null {
  const raw = String(rawInput || '').trim()
  if (!raw) return null
  const apiMap = parseGrabPartnerApiMenuMerchantMap()
  if (!Object.keys(apiMap).length) return null
  const candidates = [raw, ...expandGrabStoreMapLinkedCodes([raw])]
  for (const code of candidates) {
    const hit = apiMap[String(code || '').trim()]
    if (hit && isGrabMenuSyncMerchantId(hit)) return hit.trim()
  }
  return null
}

function resolveGrabMenuNotificationMerchantIDsCore(rawInput: string): string[] {
  const raw = String(rawInput || '').trim()
  if (!raw) return []

  const apiOverride = resolvePartnerApiMenuMerchantOverride(raw)
  if (apiOverride) return [apiOverride]

  const linked = expandGrabStoreMapLinkedCodes([raw])
  const portalIds = linked.filter(isGrabPortalMerchantMapKey)
  if (portalIds.length > 0) {
    return Array.from(new Set(portalIds.map((id) => id.trim()).filter(Boolean))).sort()
  }

  const partnerApiIds = linked.filter(isGrabPartnerApiMerchantId)
  if (partnerApiIds.length > 0) {
    return Array.from(new Set(partnerApiIds.map((id) => id.trim()).filter(Boolean))).sort()
  }

  if (isGrabPortalMerchantMapKey(raw)) return [raw]
  if (isGrabPartnerApiMerchantId(raw)) return [raw]
  return []
}

/** ERP store_code·표시명이 맵 value(예: CM True Digital)로만 등록된 경우 */
function merchantIdsFromMapStoreAlias(storeCode: string): string[] {
  const want = normStoreKey(storeCode)
  if (!want) return []
  const map = parseGrabStoreMap()
  const seeds = new Set<string>()
  for (const [k, v] of Object.entries(map)) {
    const kt = String(k || '').trim()
    const vt = String(v || '').trim()
    if (kt && normStoreKey(kt) === want) seeds.add(kt)
    if (vt && normStoreKey(vt) === want) seeds.add(vt)
  }
  const out = new Set<string>()
  for (const seed of seeds) {
    for (const id of resolveGrabMenuNotificationMerchantIDsCore(seed)) out.add(id)
  }
  return Array.from(out).sort()
}

/**
 * POS/ERP 입력 → Grab menu/campaign sync용 merchantID.
 * `GRAB_PARTNER_API_MENU_MERCHANT_MAP` 최우선 → 포털 `3-…` → GFSBPOS.
 */
export function resolveGrabMenuNotificationMerchantIDs(rawInput: string): string[] {
  const core = resolveGrabMenuNotificationMerchantIDsCore(rawInput)
  if (core.length > 0) return core
  return merchantIdsFromMapStoreAlias(rawInput)
}

/** Load·진단: 맵 실패 시 `pos_grab_store_integrations` fallback */
export async function resolveGrabMenuNotificationMerchantIDsWithDbFallback(
  rawInput: string
): Promise<string[]> {
  const raw = String(rawInput || '').trim()
  if (!raw) return []
  const fromMap = resolveGrabMenuNotificationMerchantIDs(raw)
  if (fromMap.length > 0) return fromMap

  const map = parseGrabStoreMap()
  for (const partnerId of collectGrabPartnerStoreIds(raw, map)) {
    const ids = resolveGrabMenuNotificationMerchantIDs(partnerId)
    if (ids.length > 0) return ids
  }

  const rows = (await supabaseSelectFilter(
    'pos_grab_store_integrations',
    `partner_merchant_id=eq.${encodeURIComponent(raw)}`,
    { limit: 10, select: 'grab_merchant_id,partner_merchant_id', order: 'updated_at.desc' }
  ).catch(() => [])) as Array<{ grab_merchant_id?: string; partner_merchant_id?: string }> | null

  const out = new Set<string>()
  for (const row of rows || []) {
    const grabId = String(row.grab_merchant_id ?? '').trim()
    const partnerId = String(row.partner_merchant_id ?? '').trim()
    for (const id of resolveGrabMenuNotificationMerchantIDs(grabId)) out.add(id)
    for (const id of resolveGrabMenuNotificationMerchantIDs(partnerId)) out.add(id)
    if (isGrabMenuSyncMerchantId(grabId)) out.add(grabId)
  }
  return Array.from(out).sort()
}

/** ERP 매장코드·표시명 → Grab menu sync merchantID (맵 BFS + 값 일치 + partner 숫자) */
export function collectGrabMenuSyncMerchantIDsForStoreLookup(storeCode: string): string[] {
  const raw = String(storeCode || '').trim()
  if (!raw) return []
  const out = new Set<string>()
  const add = (seed: string) => {
    for (const id of resolveGrabMenuNotificationMerchantIDs(seed)) out.add(id)
  }
  add(raw)
  const map = parseGrabStoreMap()
  const want = normStoreKey(raw)
  for (const [k, v] of Object.entries(map)) {
    const kt = String(k || '').trim()
    const vt = String(v || '').trim()
    if (!kt && !vt) continue
    if (want && (normStoreKey(kt) === want || normStoreKey(vt) === want)) {
      add(kt)
      add(vt)
    }
  }
  for (const pid of collectGrabPartnerStoreIds(raw, map)) add(pid)
  return Array.from(out).filter(Boolean).sort()
}

/** 맵 실패 시 `pos_grab_store_integrations`의 grab/partner ID로 재시도 */
export async function resolveGrabMenuNotificationMerchantIDsForStore(
  storeCode: string
): Promise<string[]> {
  const fromMap = collectGrabMenuSyncMerchantIDsForStoreLookup(storeCode)
  if (fromMap.length > 0) return fromMap

  const raw = String(storeCode || '').trim()
  if (!raw) return []

  const rows = (await supabaseSelectFilter('pos_grab_store_integrations', 'id=gt.0', {
    limit: 200,
    select: 'grab_merchant_id,partner_merchant_id,integration_status',
    order: 'updated_at.desc',
  }).catch(() => [])) as Array<{
    grab_merchant_id?: string | null
    partner_merchant_id?: string | null
  }> | null

  const want = normStoreKey(raw)
  const out = new Set<string>()
  for (const row of rows || []) {
    const grab = String(row.grab_merchant_id ?? '').trim()
    const partner = String(row.partner_merchant_id ?? '').trim()
    const match =
      (want && (normStoreKey(grab) === want || normStoreKey(partner) === want)) ||
      grab === raw ||
      partner === raw
    if (!match) continue
    for (const id of collectGrabMenuSyncMerchantIDsForStoreLookup(grab)) out.add(id)
    for (const id of collectGrabMenuSyncMerchantIDsForStoreLookup(partner)) out.add(id)
    if (isGrabMenuSyncMerchantId(grab)) out.add(grab)
  }
  return Array.from(out).filter(Boolean).sort()
}

/** `GRAB_STORE_MAP_JSON`(+ portal map)의 menu sync 대상 merchantID 전부 */
export function listAllGrabFoodMerchantIdsFromStoreMap(): string[] {
  const map = parseGrabStoreMap()
  return Object.keys(map)
    .filter(isGrabMenuSyncMerchantId)
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .sort()
}

/** `GRAB_PORTAL_MERCHANT_MAP`의 Prod 포털 merchantID — ERP 프로모는 매장 공통이므로 전부 동기화 대상 */
export function listAllGrabPortalMerchantIdsFromEnv(): string[] {
  const portal = parseGrabPortalMerchantMap()
  const out = new Set<string>()
  for (const merchantId of Object.keys(portal)) {
    if (!isGrabPortalMerchantMapKey(merchantId)) continue
    for (const id of resolveGrabMenuNotificationMerchantIDs(merchantId)) {
      if (id) out.add(id)
    }
  }
  return Array.from(out).sort()
}
