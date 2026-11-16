export type ProjectedOutstandingResult = {
  projectedByStore: Record<string, number>
  overReceivedStores: { store: string; projected: number }[]
}

export function projectOutstandingAfterDelete(params: {
  currentOutstandingByStore: Record<string, number>
  deletingReceivableByStore: Record<string, number>
  epsilon?: number
}): ProjectedOutstandingResult {
  const eps = Number.isFinite(params.epsilon) ? Number(params.epsilon) : 0.0001
  const stores = [
    ...new Set([
      ...Object.keys(params.currentOutstandingByStore || {}),
      ...Object.keys(params.deletingReceivableByStore || {}),
    ]),
  ]
  const projectedByStore: Record<string, number> = {}
  const overReceivedStores: { store: string; projected: number }[] = []
  for (const store of stores) {
    const current = Number(params.currentOutstandingByStore?.[store] || 0)
    const deleting = Number(params.deletingReceivableByStore?.[store] || 0)
    const projected = current - deleting
    projectedByStore[store] = projected
    // 미수 차감액이 없으면 잔액 불변 → 기존 수금 초과만으로 취소/삭제를 막지 않음.
    // (예: 출고·Order 미수 0원인 승인 주문 취소)
    if (deleting > Math.abs(eps) && projected < -Math.abs(eps)) {
      overReceivedStores.push({ store, projected })
    }
  }
  return { projectedByStore, overReceivedStores }
}
