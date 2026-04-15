/**
 * 손익 본사 출고 vs 승인 발주 차이(Δ)가 운영상 주목할 만한지.
 * - 출고가 거의 없을 때: 절대액 기준
 * - 출고가 있을 때: max(고정 바닥, 출고의 비율) 중 큰 쪽
 */
export function isMaterialHqOutboundOrderDiff(params: {
  outboundTotal: number
  approvedOrdersTotal: number
  diff: number
}): boolean {
  const d = Math.abs(Number(params.diff) || 0)
  if (d < 0.01) return false
  const o = Math.abs(Number(params.outboundTotal) || 0)
  if (o < 1) return d >= 500
  return d >= Math.max(1000, o * 0.05)
}
