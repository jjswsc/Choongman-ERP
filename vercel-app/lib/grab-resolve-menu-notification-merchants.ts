import { expandGrabStoreMapLinkedCodes, parseGrabStoreMap } from '@/lib/grab-store-map-env'

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

/**
 * POS/ERP 입력 → Grab menu/campaign sync용 merchantID.
 * 맵에 포털(`3-…`)·GFSBPOS 둘 다 있으면 **포털(Prod) 우선** — test GFSBPOS만 남기지 않음.
 */
export function resolveGrabMenuNotificationMerchantIDs(rawInput: string): string[] {
  const raw = String(rawInput || '').trim()
  if (!raw) return []

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

/** `GRAB_STORE_MAP_JSON`(+ portal map)의 menu sync 대상 merchantID 전부 */
export function listAllGrabFoodMerchantIdsFromStoreMap(): string[] {
  const map = parseGrabStoreMap()
  return Object.keys(map)
    .filter(isGrabMenuSyncMerchantId)
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .sort()
}
