/**
 * Grab menu notification — 쉼표·줄바꿈·세미콜론으로 구분된 merchant ID / 파트너 코드 붙여넣기.
 * (공백은 trim으로 정리; `GFSBPOS-204-253, GFSBPOS-533-636` 형태 지원)
 */
export function parseGrabMenuNotificationMerchantBulkInput(raw: string): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  return s
    .split(/[\n\r,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}
