/**
 * 80mm 열전사 영수증 레이아웃 상수
 * 동기화: lib/pos-receipt-html.ts, pos-receipt-modal.tsx, app/pos/order/page.tsx, app/admin/pos-printers/page.tsx (`RECEIPT_TRAILING_BOTTOM_MM` 포함)
 */
export const RECEIPT_INNER_INSET_LEFT_MM = 5
/** 열전사·Electron 오른쪽 비인쇄영역 — 값 키우면 본문 폭 축소 */
export const RECEIPT_INNER_INSET_RIGHT_MM = 15
/** 본문 아래 여백(롤 피드). 일부 ESC/POS 드라이버는 값이 작으면 절단선이 본문과 겹침(Zywell 등). */
export const RECEIPT_TRAILING_BOTTOM_MM = 6
/** 물리 보정: 음수면 왼쪽으로 당김(과하면 오른쪽 잘림 유발) */
export const RECEIPT_CONTENT_NUDGE_LEFT_MM = 2
/** 메뉴명 | 금액 그리드의 금액 열 폭 */
export const RECEIPT_AMOUNT_COL_MM = 16
export const RECEIPT_GRID_COL_GAP_PX = 3
