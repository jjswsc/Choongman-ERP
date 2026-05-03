import { parseGrabStoreMap } from '@/lib/grab-store-map-env'

/** Grab `merchantID` 키만 (GFSBPOS-…). 맵의 파트너 숫자·ERP 코드 키는 제외 */
export function isGrabFoodMerchantMapKey(k: string): boolean {
  const s = String(k || '').trim()
  if (!s) return false
  if (/^\d{1,6}$/.test(s)) return false
  return /GF/i.test(s)
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
 * POS/ERP에서 넘어온 값(store_code, 파트너 숫자 "000", Grab merchant)을
 * Grab Menu Update Notification에 쓸 merchantID 목록으로 변환한다.
 */
export function resolveGrabMenuNotificationMerchantIDs(rawInput: string): string[] {
  const raw = String(rawInput || '').trim()
  if (!raw) return []
  if (isGrabFoodMerchantMapKey(raw)) return [raw]
  const map = parseGrabStoreMap()
  const out = new Set<string>()
  const partnerIds = collectGrabPartnerStoreIds(raw, map)
  for (const pid of partnerIds) {
    for (const [grabMerchantID, mappedStore] of Object.entries(map)) {
      if (!isGrabFoodMerchantMapKey(grabMerchantID)) continue
      if (String(mappedStore).trim() === pid) out.add(grabMerchantID)
    }
  }
  return Array.from(out)
}
