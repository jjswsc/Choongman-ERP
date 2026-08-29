/**
 * 홍보물 매장별 수령·설치 확인 API 클라이언트
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { apiJsonArrayResponse } from './helpers'

export interface MarketingMaterialStoreCheck {
  id: string
  materialId: string
  campaignId: string | null
  storeName: string
  receivedOn: string | null
  receivedBy: string
  installedOn: string | null
  installedBy: string
  installedPlacementSpot: string | null
  installedPhotoUrl: string
  note: string
  /** 해당 매장 출고 개수. 없으면 품목 총수량 균등 배분으로 표시 */
  quantity?: number | null
  updatedAt: string | null
}

export async function getMarketingMaterialStoreChecks(params?: {
  campaignId?: string
  materialId?: string
  store?: string
}) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.materialId) q.set('materialId', params.materialId)
  if (params?.store) q.set('store', params.store)
  const res = await apiFetchWithOffline(
    '/api/marketingMaterialStoreChecks' + (q.toString() ? '?' + q.toString() : '')
  )
  return apiJsonArrayResponse<MarketingMaterialStoreCheck>(res)
}

export async function saveMarketingMaterialStoreCheck(params: {
  id?: string
  materialId: string
  campaignId?: string | null
  storeName: string
  receivedOn?: string | null
  receivedBy?: string
  installedOn?: string | null
  installedBy?: string
  installedPlacementSpot?: string | null
  installedPhotoUrl?: string | null
  note?: string
  materialType?: string | null
  quantity?: number | null
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterialStoreChecks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    deploymentCreated?: boolean
  }>
}
