/**
 * POS 열전사(80mm 롤) 영수증 — @page 높이
 *
 * 높이를 짧게 고정(예: 200mm)하면 브라우저가 긴 내용을 다음 페이지로 넘겨
 * 한 주문이 2장으로 잘릴 수 있음. 롤은 한 컷으로 이어지게 하려면
 * 한 페이지 박스를 충분히 길게 두는 편이 안전함(드라이버 프리셋 80×3276mm 등과 동일 개념).
 */
export const POS_THERMAL_RECEIPT_WIDTH_MM = 80
export const POS_THERMAL_RECEIPT_PAGE_HEIGHT_MM = 3276

export function posThermalReceiptPageSizeRule(): string {
  return `@page { size: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm ${POS_THERMAL_RECEIPT_PAGE_HEIGHT_MM}mm; margin: 0; }`
}
