/**
 * LINKPOS/카드 단말 승인 API 사용 여부.
 *
 * 기본(미설정): 호출하지 않음 — 카드 금액만 결제 화면에서 수동 입력.
 * 은행·릴레이 연동 후:
 * - Vercel 등에 `NEXT_PUBLIC_LINKPOS_CARD_ENABLED=true`
 * - `LINKPOS_RELAY_URL`(및 매장 PC 로컬 브리지 포트) 구성
 * - 관리자 POS 프린터 설정에서 「카드 시 단말 생략」을 끄면(false) 단말 호출까지 진행
 */
export function isLinkposCardApiEnabled(): boolean {
  return String(process.env.NEXT_PUBLIC_LINKPOS_CARD_ENABLED || '').trim().toLowerCase() === 'true'
}
