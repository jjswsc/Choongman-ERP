import { expandGrabStoreMapLinkedCodes, parseGrabStoreMap } from '@/lib/grab-store-map-env'

/**
 * Grab Partner API `merchantID` 키.
 * - `GFSBPOS-…` (파트너 API ID)
 * - `3-C6DWPB4VCKK1GT` 형태 포털 ID (주문·손님 앱 — `GF` 접두사 없음)
 * 파트너 스토어 숫자(1040)·ERP store_code는 제외.
 */
export function isGrabFoodMerchantMapKey(k: string): boolean {
  const s = String(k || '').trim()
  if (!s) return false
  if (/^\d{1,6}$/.test(s)) return false
  if (/GF/i.test(s)) return true
  return /^\d+-[A-Z0-9]+$/i.test(s)
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
 * POS/ERP에서 넘어온 값(store_code, 파트너 숫자 "1040", Grab merchant)을
 * Grab Menu Update Notification·캠페인 sync에 쓸 merchantID 목록으로 변환한다.
 *
 * 같은 매장에 `GFSBPOS-…`와 포털 ID(`3-…`)가 둘 다 있으면 **전부** 반환한다.
 * (손님 앱은 포털 ID, 파트너 API는 GFSBPOS — 둘 다 동기화해야 컷프라이스 반영)
 */
export function resolveGrabMenuNotificationMerchantIDs(rawInput: string): string[] {
  const raw = String(rawInput || '').trim()
  if (!raw) return []

  const linked = expandGrabStoreMapLinkedCodes([raw])
  const grabIds = linked.filter(isGrabFoodMerchantMapKey)
  if (grabIds.length > 0) {
    return Array.from(new Set(grabIds.map((id) => id.trim()).filter(Boolean))).sort()
  }

  if (isGrabFoodMerchantMapKey(raw)) return [raw]
  return []
}

/** `GRAB_STORE_MAP_JSON`에 등록된 Grab merchantID 키 전부(일괄 menu notification용) */
export function listAllGrabFoodMerchantIdsFromStoreMap(): string[] {
  const map = parseGrabStoreMap()
  return Object.keys(map)
    .filter(isGrabFoodMerchantMapKey)
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .sort()
}
