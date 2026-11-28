/**
 * 손님 QR 카테고리 홈(대표메뉴 배너 + 신메뉴 안내 + 대분류 그리드).
 * 예전에는 office(본사)만. 이제 전 매장 기본이다.
 * 메뉴 목록 화면은 카테고리를 고른 뒤에 그대로 쓴다.
 */

/** 카테고리 우선 홈. 끄면 예전처럼 메뉴 목록으로 바로 들어간다. */
export function isQrGuestCategoryHomeEnabled(_storeCode?: string | null): boolean {
  return true
}

/** @deprecated 전 매장 오픈. isQrGuestCategoryHomeEnabled 를 쓴다. */
export function isQrGuestCategoryHomePilotStore(storeCode?: string | null): boolean {
  return isQrGuestCategoryHomeEnabled(storeCode)
}

/**
 * 오피스 카테고리 홈과 같은 그림 규칙.
 * 관리자가 올린 대분류 URL이 있으면 그걸 쓰고, 없으면 그 대분류의 첫 메뉴 사진.
 * 코드에 박힌 아이콘 파일이 아니다. 매장 설정 `guestHomeCategoryImageUrls`(DB jsonb) + 메뉴 사진.
 */
export function pickQrGuestCategoryImageRaw(input: {
  categoryKey: string
  adminUrls?: Record<string, string> | null
  menuImageUrls?: Iterable<string | null | undefined>
}): string {
  const key = String(input.categoryKey || '').trim()
  const fromAdmin = key ? String(input.adminUrls?.[key] || '').trim() : ''
  if (fromAdmin) return fromAdmin
  for (const raw of input.menuImageUrls || []) {
    const url = String(raw || '').trim()
    if (url) return url
  }
  return ''
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
