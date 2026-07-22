/**
 * LINKPOS/카드 단말 승인 API 사용 여부.
 *
 * - `LINKPOS_FORCE_MANUAL_CARD=true` → 전 매장 수기만
 * - 그 외 `NEXT_PUBLIC_LINKPOS_CARD_ENABLED=true` 이면 단말 호출
 * - 매장 「단말 생략」이 true면 수기, false/미설정(연동 ON일 때)이면 단말
 */

/** true면 전 매장 수기 카드(단말/릴레이 호출 안 함). EDC 연동 시 false. */
export const LINKPOS_FORCE_MANUAL_CARD = false

export function isLinkposCardApiEnabled(): boolean {
  if (LINKPOS_FORCE_MANUAL_CARD) return false
  return String(process.env.NEXT_PUBLIC_LINKPOS_CARD_ENABLED || '').trim().toLowerCase() === 'true'
}

/**
 * 단말 승인 생략(수기) 여부.
 * - 강제 수기 / API 미활성 → 생략
 * - 매장 설정 true → 생략
 * - 매장 설정 false 또는 (API 활성 + 미설정) → 단말 사용
 */
export function shouldSkipLinkposTerminalForCard(storeSetting?: boolean | null): boolean {
  if (LINKPOS_FORCE_MANUAL_CARD) return true
  if (!isLinkposCardApiEnabled()) return true
  if (storeSetting === true) return true
  if (storeSetting === false) return false
  return false
}
