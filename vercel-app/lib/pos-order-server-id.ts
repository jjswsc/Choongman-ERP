/**
 * 오프라인 큐에만 있는 주문은 임시 음수 id 를 쓰므로,
 * 서버 행이 있는 주문만 update/mark API 를 호출해야 한다.
 */
export function posOrderHasServerId(orderId: string | number | undefined | null): boolean {
  const n = Number(orderId)
  return Number.isFinite(n) && n > 0
}
