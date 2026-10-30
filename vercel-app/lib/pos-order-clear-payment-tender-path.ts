/**
 * updatePosOrder 가 items 없이 clearPaymentTender 만 보낼 때
 * 결제액 전용 경로를 탈지 판정 (단위 테스트용 순수 함수).
 */
export function shouldUseClearPaymentTenderOnlyPath(body: Record<string, unknown>): boolean {
  const clear =
    body.clearPaymentTender === true ||
    body.clear_payment_tender === true ||
    String(body.clearPaymentTender ?? body.clear_payment_tender ?? '') === '1'
  if (!clear) return false
  const items = Array.isArray(body.items) ? body.items : []
  return items.length === 0
}
