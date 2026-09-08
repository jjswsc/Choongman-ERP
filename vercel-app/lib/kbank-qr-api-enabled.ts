/**
 * KBank Partner QR API 호출 생략(수기) 여부.
 * - 매장 설정 true → API 없이 QR 금액만 반영
 * - 매장 설정 false → generate-qr / 콜백·Inquiry 사용
 * - 미설정(null) → 은행 MID 개통 매장(코드 기본값)은 API 사용(false), 그 외는 수기(true)
 */
import { lookupChoongmanKbankStoreDefaults } from '@/lib/kbank-store-merchant-defaults'

export function shouldSkipKbankApiForQr(storeSetting?: boolean | null): boolean {
  if (storeSetting === false) return false
  return true
}

/** GET 설정: 개통 매장은 미저장 시 API 호출(끄기). 명시 true/false는 그대로. */
export function resolveKbankSkipApiForQrSetting(
  storeCode: string,
  storeSetting?: boolean | null
): boolean {
  if (typeof storeSetting === 'boolean') return storeSetting
  return lookupChoongmanKbankStoreDefaults(storeCode) == null
}
