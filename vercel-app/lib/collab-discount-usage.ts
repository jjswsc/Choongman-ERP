/** 협업 할인 사용 현황 — JS fallback 집계 (RPC 미배포 시) */

export type CollabDiscountUsageOrderRow = {
  marketing_campaign_id?: number | string | null
  collab_discount_amt?: number | string | null
  store_code?: string | null
  status?: string | null
  created_at?: string | null
}

export type CollabDiscountUsageAggRow = {
  campaignId: string
  orderCount: number
  discountAmount: number
  storeCount: number
}

export type CollabDiscountUsageByStoreAggRow = {
  storeCode: string
  orderCount: number
  discountAmount: number
  campaignCount: number
}

export type CollabDiscountUsageDailyAggRow = {
  ymd: string
  orderCount: number
  discountAmount: number
}

export const COLLAB_DISCOUNT_USAGE_COMPLETED_STATUSES = ['completed', 'paid', 'ready'] as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isCompletedStatus(statusRaw: unknown): boolean {
  const status = String(statusRaw ?? '')
    .trim()
    .toLowerCase()
  return (COLLAB_DISCOUNT_USAGE_COMPLETED_STATUSES as readonly string[]).includes(status)
}

function parseCampaignId(raw: unknown): string | null {
  const campaignId = String(raw ?? '').trim()
  if (!campaignId || campaignId === '0') return null
  return campaignId
}

function parseDiscountAmt(raw: unknown): number {
  return Math.max(0, Number(raw ?? 0) || 0)
}

/** 방콕 기준 YYYY-MM-DD (timestamptz ISO 문자열) */
export function bangkokYmdFromCreatedAt(iso: string | null | undefined): string | null {
  const s = String(iso ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export function aggregateCollabDiscountUsageFromOrders(
  rows: CollabDiscountUsageOrderRow[]
): CollabDiscountUsageAggRow[] {
  const map = new Map<
    string,
    { orderCount: number; discountAmount: number; stores: Set<string> }
  >()

  for (const row of rows) {
    if (!isCompletedStatus(row.status)) continue
    const campaignId = parseCampaignId(row.marketing_campaign_id)
    if (!campaignId) continue
    const amt = parseDiscountAmt(row.collab_discount_amt)
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

export function aggregateCollabDiscountUsageByStoreFromOrders(
  rows: CollabDiscountUsageOrderRow[]
): CollabDiscountUsageByStoreAggRow[] {
  const map = new Map<
    string,
    { orderCount: number; discountAmount: number; campaigns: Set<string> }
  >()

  for (const row of rows) {
    if (!isCompletedStatus(row.status)) continue
    const campaignId = parseCampaignId(row.marketing_campaign_id)
    if (!campaignId) continue
    const amt = parseDiscountAmt(row.collab_discount_amt)
    if (amt <= 0.0001) continue
    const storeCode = String(row.store_code ?? '').trim()
    if (!storeCode) continue

    const prev = map.get(storeCode) ?? {
      orderCount: 0,
      discountAmount: 0,
      campaigns: new Set<string>(),
    }
    prev.orderCount += 1
    prev.discountAmount = round2(prev.discountAmount + amt)
    prev.campaigns.add(campaignId)
    map.set(storeCode, prev)
  }

  return [...map.entries()]
    .map(([storeCode, v]) => ({
      storeCode,
      orderCount: v.orderCount,
      discountAmount: v.discountAmount,
      campaignCount: v.campaigns.size,
    }))
    .sort(
      (a, b) =>
        b.discountAmount - a.discountAmount ||
        b.orderCount - a.orderCount ||
        a.storeCode.localeCompare(b.storeCode)
    )
}

export function aggregateCollabDiscountUsageDailyFromOrders(
  rows: CollabDiscountUsageOrderRow[]
): CollabDiscountUsageDailyAggRow[] {
  const map = new Map<string, { orderCount: number; discountAmount: number }>()

  for (const row of rows) {
    if (!isCompletedStatus(row.status)) continue
    const campaignId = parseCampaignId(row.marketing_campaign_id)
    if (!campaignId) continue
    const amt = parseDiscountAmt(row.collab_discount_amt)
    if (amt <= 0.0001) continue
    const ymd = bangkokYmdFromCreatedAt(row.created_at)
    if (!ymd) continue

    const prev = map.get(ymd) ?? { orderCount: 0, discountAmount: 0 }
    prev.orderCount += 1
    prev.discountAmount = round2(prev.discountAmount + amt)
    map.set(ymd, prev)
  }

  return [...map.entries()]
    .map(([ymd, v]) => ({
      ymd,
      orderCount: v.orderCount,
      discountAmount: v.discountAmount,
    }))
    .sort((a, b) => a.ymd.localeCompare(b.ymd))
}
