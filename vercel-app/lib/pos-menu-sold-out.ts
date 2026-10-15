/**
 * POS·QR·관리자 공통: sold_out_date 가 있으면 품절.
 * (수동으로 다시 열 때까지 유지 — 날짜가 지나도 자동 해제되지 않음)
 * sold_out_date 값은 품절 처리한 방콕 일자(기록용)이며, null 이면 판매 중.
 */
export function isPosMenuSoldOut(soldOutDate: string | null | undefined): boolean {
  return !!String(soldOutDate || '').trim().slice(0, 10)
}

/** 매장 품절 범위: all = 전 채널, store = หน้าร้าน(홀·포장·QR·픽업)만 — 배달은 계속 판매 */
export type PosMenuSoldOutScope = 'all' | 'store'

export function normalizePosMenuSoldOutScope(raw: unknown): PosMenuSoldOutScope {
  return String(raw || '').trim().toLowerCase() === 'store' ? 'store' : 'all'
}

/** 주문 채널 기준 품절 판정 — 배달 주문은 store(หน้าร้าน만) 품절을 무시 */
export function isPosMenuSoldOutForOrderType(
  menu: { soldOutDate?: string | null; soldOutScope?: PosMenuSoldOutScope | null },
  orderType: string | null | undefined
): boolean {
  if (!isPosMenuSoldOut(menu.soldOutDate)) return false
  if (orderType === 'delivery' && menu.soldOutScope === 'store') return false
  return true
}

/** soldOutDate만 보는 하위 로직(반반 맛 후보 등)용 — 이 채널에서 판매 가능한 메뉴는 soldOutDate를 비운다 */
export function withSoldOutForOrderType<T extends { soldOutDate?: string | null; soldOutScope?: PosMenuSoldOutScope | null }>(
  menus: T[],
  orderType: string | null | undefined
): T[] {
  if (orderType !== 'delivery') return menus
  return menus.map((m) =>
    isPosMenuSoldOut(m.soldOutDate) && !isPosMenuSoldOutForOrderType(m, orderType) ? { ...m, soldOutDate: null } : m
  )
}
