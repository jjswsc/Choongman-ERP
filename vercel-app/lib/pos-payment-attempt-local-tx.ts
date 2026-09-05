/**
 * pos_payment_attempts.local_tx_id 는 unique.
 * 하이브리드 EDC 브리지는 payment.reference1 을 안 주는 경우가 있어 '' 가 들어가면
 * 두 번째 카드 결제부터 23505 (Key (local_tx_id)=() already exists) 가 난다.
 */

export function resolvePosPaymentAttemptLocalTxId(params: {
  reference1?: unknown
  orderId?: number | null
  nowMs?: number
  nonce?: string
}): string {
  const fromRef = String(params.reference1 ?? '').trim().slice(0, 40)
  if (fromRef) return fromRef
  const orderPart = Number(params.orderId) > 0 ? String(Math.trunc(Number(params.orderId))) : '0'
  const nonce =
    String(params.nonce ?? '').trim() ||
    `${Number(params.nowMs ?? Date.now()).toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `GEN${orderPart}-${nonce}`.slice(0, 40)
}

export function buildPosPaymentAttemptRowFromLinkpos(params: {
  orderId: number
  linkposPayment: Record<string, unknown>
  nowIso?: string
}): Record<string, unknown> {
  const p = params.linkposPayment
  const responseCode = String(p.responseCode ?? '')
  return {
    order_id: params.orderId,
    local_tx_id: resolvePosPaymentAttemptLocalTxId({
      reference1: p.reference1,
      orderId: params.orderId,
    }),
    provider: String(p.provider ?? 'kbtg_linkpos'),
    mode: String(p.mode ?? 'hypercom'),
    tx_code: String(p.txCode ?? '20'),
    bank_id: String(p.bankId ?? ''),
    request_amount: Number(p.requestedAmount ?? 0),
    approved_amount: Number(p.approvedAmount ?? 0),
    response_code: responseCode,
    approval_code: String(p.approvalCode ?? ''),
    trace_no: String(p.traceNo ?? ''),
    terminal_id: String(p.terminalId ?? ''),
    merchant_id: String(p.merchantId ?? ''),
    status: responseCode === '00' ? 'approved' : 'declined',
    created_at: String(p.requestedAt ?? params.nowIso ?? new Date().toISOString()),
  }
}
