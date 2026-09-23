/**
 * POS·QR·관리자 공통: sold_out_date 가 있으면 품절.
 * (수동으로 다시 열 때까지 유지 — 날짜가 지나도 자동 해제되지 않음)
 * sold_out_date 값은 품절 처리한 방콕 일자(기록용)이며, null 이면 판매 중.
 */
export function isPosMenuSoldOut(soldOutDate: string | null | undefined): boolean {
  return !!String(soldOutDate || '').trim().slice(0, 10)
}
