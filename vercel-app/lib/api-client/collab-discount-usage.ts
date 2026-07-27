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

export type CollabDiscountUsageResult = {
  success: boolean
  message?: string
  startStr?: string
  endStr?: string
  store?: string | null
  campaignId?: string | null
  source?: 'rpc' | 'fallback' | 'unavailable'
  rows?: CollabDiscountUsageRow[]
  totals?: {
    orderCount: number
    discountAmount: number
    campaignCount: number
  }
}

export async function getCollabDiscountUsage(params: {
  startStr: string
  endStr: string
  store?: string
  campaignId?: string
}): Promise<CollabDiscountUsageResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.store?.trim()) q.set('store', params.store.trim())
  if (params.campaignId?.trim()) q.set('campaignId', params.campaignId.trim())
  const res = await apiFetchWithOffline(`/api/collabDiscountUsage?${q}`)
  return res.json() as Promise<CollabDiscountUsageResult>
}
