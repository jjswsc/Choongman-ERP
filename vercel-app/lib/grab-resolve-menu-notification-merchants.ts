import { expandGrabStoreMapLinkedCodes, parseGrabStoreMap } from '@/lib/grab-store-map-env'

/** Grab Partner API menu/campaign 호출용 — `GFSBPOS-…` 만 (menu notification·캠페인·updateMenu) */
export function isGrabPartnerApiMerchantId(k: string): boolean {
  const s = String(k || '').trim()
  if (!s || /^\d{1,6}$/.test(s)) return false
  return /GF/i.test(s)
}

/** Grab 포털 merchantID — 주문·손님 앱 (`3-C6DWPB4VCKK1GT`). Partner API 쓰기 호출 불가 */
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
 * POS/ERP에서 넘어온 값 → Grab Menu Notification·캠페인 sync용 `GFSBPOS-…` 목록.
 * 포털 ID(`3-…`)는 맵 연결·주문 매칭용이며 Partner API menu notification은 404 → **제외**.
 */
export function resolveGrabMenuNotificationMerchantIDs(rawInput: string): string[] {
  const raw = String(rawInput || '').trim()
  if (!raw) return []

  const linked = expandGrabStoreMapLinkedCodes([raw])
  const partnerApiIds = linked.filter(isGrabPartnerApiMerchantId)
  if (partnerApiIds.length > 0) {
    return Array.from(new Set(partnerApiIds.map((id) => id.trim()).filter(Boolean))).sort()
  }

  if (isGrabPartnerApiMerchantId(raw)) return [raw]
  return []
}

/** `GRAB_STORE_MAP_JSON`의 `GFSBPOS-…` 키 전부(일괄 menu notification용) */
export function listAllGrabFoodMerchantIdsFromStoreMap(): string[] {
  const map = parseGrabStoreMap()
  return Object.keys(map)
    .filter(isGrabPartnerApiMerchantId)
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .sort()
}
