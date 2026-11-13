/**
 * 손님 QR 카테고리 홈(대표메뉴 배너 + 신메뉴 안내 + 대분류 그리드) 파일럿.
 * 실매장 영향 없이 office(본사)에서만 켠다.
 */

const PILOT_STORE_CODES = new Set(['office', '본사', 'cm office', 'hq'])

export function isQrGuestCategoryHomePilotStore(storeCode: string | null | undefined): boolean {
  const s = String(storeCode || '')
    .trim()
    .toLowerCase()
  if (!s) return false
  return PILOT_STORE_CODES.has(s)
}

/** 대표메뉴 히어로 — 목업 대비 약 절반 높이 */
export const QR_GUEST_HOME_HERO_HEIGHT_CLASS = 'h-[7.5rem]'

/** 신메뉴 안내 칸 */
export const QR_GUEST_HOME_NEW_MENU_HEIGHT_CLASS = 'h-[6.5rem]'
