/** 서버/클라이언트 공용 — Node·Supabase 의존 없음 */

export const DEFAULT_CARD_KEYS = ['Visa', 'Master', 'Amex', 'JCB', 'Other']
/** POS 결제 탭「QR 코드」한 줄(PromptPay)과 동일 — 결산 QR 상세 */
export const DEFAULT_QR_KEYS = ['PromptPay']
/** POS 결제 탭「기타」세부(레거시 지갑)와 동일 — 결산 기타 상세 */
export const DEFAULT_OTHER_KEYS = ['TrueMoney', 'WeChat', 'Alipay', 'UnionPay', 'LINE Pay', 'Shopee Pay', 'Other']
export const DEFAULT_DELIVERY_KEYS = ['Grab', 'Line Man', 'Shopee', 'Other']

/** 예전 결산에 qr_breakdown에 몰려 있던 키 → 로드 시 기타로 이동 */
export const LEGACY_QR_BREAKDOWN_KEYS_AS_OTHER = [
  ...DEFAULT_OTHER_KEYS,
  'QR',
] as const
