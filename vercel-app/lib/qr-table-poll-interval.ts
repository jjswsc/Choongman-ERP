/**
 * 테이블 QR 폴링 간격 — Fluid Active CPU·Invocations.
 * 선결제는 손님이 QR을 띄운 동안에만 돌고, 홀 배지는 켠 매장 POS마다 상시.
 */

/** 손님 폰 입점비·추가메뉴 선결제 상태 조회 (KBank Inquiry). */
export const QR_TABLE_GUEST_PAY_POLL_MS = 8_000

/** QR 켠 매장 — 홀 테이블 배지·세션 패널 */
export const QR_FLOOR_SESSION_HINTS_POLL_MS = 30_000

/** QR 꺼진 매장 — 설정 변경만 가끔 재확인 */
export const QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS = 300_000

/** API 실패 시 백오프 */
export const QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS = 60_000
