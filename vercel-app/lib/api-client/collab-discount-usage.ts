/**
 * 협업 할인 사용 현황 API 클라이언트
 */
import { apiFetchWithOffline } from '../api/fetch-offline'

export type CollabDiscountUsageRow = {
  campaignId: string
  campaignNo: string
  topic: string
  orderCount: number
  discountAmount: number
  storeCount: number
}

export type CollabDiscountUsageStoreRow = {
  storeCode: string
  orderCount: number
  discountAmount: number
  campaignCount: number
}

export type CollabDiscountUsageDailyRow = {
  ymd: string
  orderCount: number
  discountAmount: number
}

export type CollabDiscountUsageGroupBy = 'campaign' | 'store' | 'day'

export type CollabDiscountUsageResult = {
  success: boolean
  message?: string
  startStr?: string
  endStr?: string
  store?: string | null
  campaignId?: string | null
  groupBy?: CollabDiscountUsageGroupBy
  source?: 'rpc' | 'fallback' | 'unavailable'
  rows?: CollabDiscountUsageRow[]
  storeRows?: CollabDiscountUsageStoreRow[]
  dailyRows?: CollabDiscountUsageDailyRow[]
  totals?: {
    orderCount: number
    discountAmount: number
    campaignCount: number
    storeCount?: number
  }
}

export async function getCollabDiscountUsage(params: {
  startStr: string
  endStr: string
  store?: string
  campaignId?: string
  groupBy?: CollabDiscountUsageGroupBy
}): Promise<CollabDiscountUsageResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.store?.trim()) q.set('store', params.store.trim())
  if (params.campaignId?.trim()) q.set('campaignId', params.campaignId.trim())
  if (params.groupBy && params.groupBy !== 'campaign') q.set('groupBy', params.groupBy)
  const res = await apiFetchWithOffline(`/api/collabDiscountUsage?${q}`)
  return res.json() as Promise<CollabDiscountUsageResult>
}
