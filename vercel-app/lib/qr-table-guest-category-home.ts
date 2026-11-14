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

/** 대표·신메뉴 한 줄 반반 배너 높이 */
export const QR_GUEST_HOME_BANNER_HEIGHT_CLASS = 'h-[5.25rem]'

/** @deprecated 반반 배치 이후 단일 높이 상수 사용 */
export const QR_GUEST_HOME_HERO_HEIGHT_CLASS = QR_GUEST_HOME_BANNER_HEIGHT_CLASS
/** @deprecated 반반 배치 이후 단일 높이 상수 사용 */
export const QR_GUEST_HOME_NEW_MENU_HEIGHT_CLASS = QR_GUEST_HOME_BANNER_HEIGHT_CLASS

/**
 * 손님 화면용 테이블 표시 — POS 레이아웃의 "14번" 등 한국어 접미사를 빼고 숫자/이름만.
 */
export function formatQrGuestTableLabel(raw: string | null | undefined): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const stripped = s.replace(/\s*번\s*$/u, '').trim()
  return stripped || s
}
