/**
 * LINKPOS/카드 단말 승인 API 사용 여부.
 *
 * 기본(미설정): 호출하지 않음 — 카드 금액만 결제 화면에서 수동 입력.
 * 은행·릴레이 연동 후:
 * - 아래 `LINKPOS_FORCE_MANUAL_CARD`를 false로 전환
 * - Vercel 등에 `NEXT_PUBLIC_LINKPOS_CARD_ENABLED=true`
 * - `LINKPOS_RELAY_URL`(및 매장 PC 로컬 브리지 포트) 구성
 * - 관리자 POS 프린터 설정에서 「카드 시 단말 생략」을 끄면(false) 단말 호출까지 진행
 */

/**
 * true면 전 매장 수기 카드(단말/릴레이 호출 안 함).
 * 브리지·릴레이 준비되면 false로 바꾼 뒤 매장별 「단말 생략」만 끄면 됩니다.
 */
export const LINKPOS_FORCE_MANUAL_CARD = true

export function isLinkposCardApiEnabled(): boolean {
  if (LINKPOS_FORCE_MANUAL_CARD) return false
  return String(process.env.NEXT_PUBLIC_LINKPOS_CARD_ENABLED || '').trim().toLowerCase() === 'true'
}

/** POS·설정: 단말 승인 생략(수기) 여부. 강제 수기 중이거나 설정이 false가 아니면 생략. */
export function shouldSkipLinkposTerminalForCard(storeSetting?: boolean | null): boolean {
  if (LINKPOS_FORCE_MANUAL_CARD) return true
  return storeSetting !== false
}
