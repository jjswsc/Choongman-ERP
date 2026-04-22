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
    if (projected < -Math.abs(eps)) {
      overReceivedStores.push({ store, projected })
    }
  }
  return { projectedByStore, overReceivedStores }
}
