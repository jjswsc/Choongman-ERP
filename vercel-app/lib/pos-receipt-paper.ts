/**
 * POS 열전사(80mm 롤) 영수증 — @page 높이
 *
 * 너무 긴 높이(예: 3276mm)는 일부 브라우저/드라이버에서 "페이지 맞춤 축소"를 유발해
 * 본문이 매우 작게 출력될 수 있다. 한 컷 유지와 축소 방지를 같이 만족하는 중간값을 사용한다.
 */
export const POS_THERMAL_RECEIPT_WIDTH_MM = 80
export const POS_THERMAL_RECEIPT_PAGE_HEIGHT_MM = 600

export function posThermalReceiptPageSizeRule(): string {
  return `@page { size: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm ${POS_THERMAL_RECEIPT_PAGE_HEIGHT_MM}mm; margin: 0; }`
}
