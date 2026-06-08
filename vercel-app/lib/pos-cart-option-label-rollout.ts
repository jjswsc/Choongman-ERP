import { normStoreKey } from '@/lib/store-list-keys'

/**
 * POS 옵션 피커 표시 = 장바구니/인쇄 문자열 통일 rollout.
 *
 * - **기본(미설정)**: 전 매장
 * - **`NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES=ALL`**: 전 매장 (명시적, 기본과 동일)
 * - **`NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES=Office,CM Bangna,...`**: 지정 매장만 (부분 적용·롤백용)
 */
export function isPosCartOptionLabelMatchPickerEnabled(storeCode: string | null | undefined): boolean {
  const raw = String(storeCode ?? '').trim()
  if (!raw) return false

  const env = String(process.env.NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES ?? '').trim()
  if (env === 'ALL' || env === '*') return true
  if (env) {
    const probe = normStoreKey(raw)
    return env
      .split(',')
      .map((s) => normStoreKey(s.trim()))
      .filter(Boolean)
      .some((s) => s === probe)
  }

  return true
}
