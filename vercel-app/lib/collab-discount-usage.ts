/** 협업 할인 사용 현황 — JS fallback 집계 (RPC 미배포 시) */

export type CollabDiscountUsageOrderRow = {
  marketing_campaign_id?: number | string | null
  collab_discount_amt?: number | string | null
  store_code?: string | null
  status?: string | null
}

export type CollabDiscountUsageAggRow = {
  campaignId: string
  orderCount: number
  discountAmount: number
  storeCount: number
}

export const COLLAB_DISCOUNT_USAGE_COMPLETED_STATUSES = ['completed', 'paid', 'ready'] as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function aggregateCollabDiscountUsageFromOrders(
  rows: CollabDiscountUsageOrderRow[]
): CollabDiscountUsageAggRow[] {
  const map = new Map<
    string,
    { orderCount: number; discountAmount: number; stores: Set<string> }
  >()

  for (const row of rows) {
    const status = String(row.status ?? '')
      .trim()
      .toLowerCase()
    if (
      !(COLLAB_DISCOUNT_USAGE_COMPLETED_STATUSES as readonly string[]).includes(status)
    ) {
      continue
    }
    const campaignId = String(row.marketing_campaign_id ?? '').trim()
    if (!campaignId || campaignId === '0') continue
    const amt = Math.max(0, Number(row.collab_discount_amt ?? 0) || 0)
    if (amt <= 0.0001) continue

    const prev = map.get(campaignId) ?? {
      orderCount: 0,
      discountAmount: 0,
      stores: new Set<string>(),
    }
    prev.orderCount += 1
    prev.discountAmount = round2(prev.discountAmount + amt)
    const store = String(row.store_code ?? '').trim()
    if (store) prev.stores.add(store)
    map.set(campaignId, prev)
  }

  return [...map.entries()]
    .map(([campaignId, v]) => ({
      campaignId,
      orderCount: v.orderCount,
      discountAmount: v.discountAmount,
      storeCount: v.stores.size,
    }))
    .sort(
      (a, b) =>
        b.discountAmount - a.discountAmount ||
        b.orderCount - a.orderCount ||
        a.campaignId.localeCompare(b.campaignId)
    )
}
