/**
 * Grab Food 메뉴 검증(validation) 한도 — 클라이언트·서버 공용 (서버 전용 import 금지).
 *
 * Grab 메뉴 sync는 전체 일괄(all-or-nothing) 검증이라, 아이템·옵션 1개라도 한도를
 * 넘으면 메뉴 전체가 거부되어 카테고리가 통째로 사라질 수 있다. 따라서 입력란(maxLength)과
 * Grab 전송 직전(서버 절단) 양쪽에서 같은 한도를 강제한다.
 *
 * 설명 길이: Grab 공식 SDK 문서상 VN만 커스텀 2000자이고, 그 외 지역(태국 등)은 기본값.
 * Grab POS 파트너 가이드 기준 기본 200자로 둔다(초과 시 메뉴 전체 검증 실패 위험).
 * @see https://github.com/grab/grabfood-api-sdk-python/blob/main/docs/MenuItem.md
 */
export const GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH = 200

/**
 * Grab 전송용 설명 정제: JSON/검증을 깨뜨릴 수 있는 제어문자 제거 + 길이 제한.
 * 일반 공백/개행/탭(0x09, 0x0A, 0x0D)은 보존한다.
 */
export function sanitizeGrabMenuDescription(raw: string | null | undefined): string {
  const text = String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
  if (text.length <= GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH) return text
  return text.slice(0, GRAB_MENU_ITEM_DESCRIPTION_MAX_LENGTH).trim()
}
