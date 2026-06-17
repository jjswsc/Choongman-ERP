/** PromptPay QR 최소 금액 (KBank generate-qr amount > 0) */
export const MEMBER_PORTAL_PREPAY_MIN_QR_BAHT = 1

/** QR 결제 대기 만료 (방콕 기준 운영 — ms) */
export const MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS = 5 * 60 * 1000

/** QR 결제 상태 폴링 — 6/12 회원앱 선결제 도입 전보다 완화 (3.5s는 Edge 과다) */
export const MEMBER_PORTAL_QR_STATUS_POLL_MS = 8_000

/** 주문 탭 목록 자동 갱신 */
export const MEMBER_PORTAL_ORDERS_POLL_MS = 60_000
