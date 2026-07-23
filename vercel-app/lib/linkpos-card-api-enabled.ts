/**
 * LINKPOS/카드 단말 승인 API 사용 여부.
 *
 * - `LINKPOS_FORCE_MANUAL_CARD=true` → 전 매장 수기만
 * - Windows 하이브리드(cmPosShell)면 로컬 브리지 사용 가능 → ON
 * - 그 외 `NEXT_PUBLIC_LINKPOS_CARD_ENABLED=true` 이면 단말 호출
 */

/** true면 전 매장 수기 카드(단말/릴레이 호출 안 함). EDC 연동 시 false. */
export const LINKPOS_FORCE_MANUAL_CARD = false

/** 브라우저에서 Windows POS 셸(로컬 EDC 브리지) 여부 */
export function hasLinkposHybridShell(): boolean {
  if (typeof window === 'undefined') return false
  const shell = window.cmPosShell
  return Boolean(shell && (typeof shell.linkposTransaction === 'function' || shell.platform === 'windows-electron'))
}

export function isLinkposCardApiEnabled(): boolean {
  if (LINKPOS_FORCE_MANUAL_CARD) return false
  if (hasLinkposHybridShell()) return true
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
