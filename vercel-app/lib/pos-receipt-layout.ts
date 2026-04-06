/**
 * 80mm 열전사 영수증 레이아웃 상수
 * 동기화: lib/pos-receipt-html.ts, pos-receipt-modal.tsx, app/pos/order/page.tsx, app/admin/pos-printers/page.tsx
 */
export const RECEIPT_INNER_INSET_LEFT_MM = 5
/** 열전사·Electron 오른쪽 비인쇄영역 — 값 키우면 본문 폭 축소 */
export const RECEIPT_INNER_INSET_RIGHT_MM = 15
/** 물리 보정: 음수면 왼쪽으로 당김(과하면 오른쪽 잘림 유발) */
export const RECEIPT_CONTENT_NUDGE_LEFT_MM = 2
/** 메뉴명 | 금액 그리드의 금액 열 폭 */
export const RECEIPT_AMOUNT_COL_MM = 16
export const RECEIPT_GRID_COL_GAP_PX = 3
