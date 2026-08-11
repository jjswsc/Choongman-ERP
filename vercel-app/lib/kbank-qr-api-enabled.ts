/**
 * KBank Partner QR API 호출 생략(수기) 여부.
 * - 매장 설정 true → API 없이 QR 금액만 반영
 * - 매장 설정 false → generate-qr / 콜백·Inquiry 사용
 * - 미설정(null) → true (은행 MID 개통 전 기본 수기)
 */
export function shouldSkipKbankApiForQr(storeSetting?: boolean | null): boolean {
  if (storeSetting === false) return false
  return true
}
