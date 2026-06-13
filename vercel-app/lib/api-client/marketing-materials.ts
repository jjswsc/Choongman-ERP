/**
 * 마케팅 판촉물·배포·사은품 API (pos-operations.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { apiJsonArrayResponse } from './helpers'

export interface MarketingMaterial {
  id: string
  campaignId: string | null
  campaignNo?: string | null
  type: string
  name: string
  quantity: number
  unitCost: number
  actualCost: number
  vendorCode?: string
  branches: string[]
  isHqWide: boolean
  displayStartDate: string | null
  displayEndDate: string | null
  placementSpots: string[]
  status: string
  note: string
  expenseAccrualId?: string | null
}

export interface MarketingMaterialDeployment {
  id: string
  materialId: string
  campaignId: string | null
  storeName: string
  placementSpot: string
  materialType: string | null
  installedOn: string | null
  removedOn: string | null
  note: string
  updatedAt: string | null
  isActive: boolean
}

export async function getMarketingMaterials(params?: { campaignId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  const res = await apiFetchWithOffline('/api/marketingMaterials' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingMaterial>(res)
}

export async function saveMarketingMaterial(params: {
  id?: string
  campaignId: string
  type?: string
  name: string
  quantity?: number
  unitCost?: number
  actualCost?: number
  branches?: string[]
  isHqWide?: boolean
  displayStartDate?: string | null
  displayEndDate?: string | null
  placementSpots?: string[]
  status?: string
  note?: string
  vendorCode?: string
  userRole?: string
  userName?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function getMarketingMaterialDeployments(params?: {
  campaignId?: string
  materialId?: string
  store?: string
  activeOnly?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.materialId) q.set('materialId', params.materialId)
  if (params?.store) q.set('store', params.store)
  if (params?.activeOnly) q.set('activeOnly', '1')
  const res = await apiFetchWithOffline('/api/marketingMaterialDeployments' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<MarketingMaterialDeployment>(res)
}

export async function saveMarketingMaterialDeployment(params: {
  id?: string
  materialId: string
  campaignId?: string | null
  storeName: string
  placementSpot: string
  materialType?: string | null
  installedOn: string
  removedOn?: string | null
  note?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterialDeployments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingMaterialDeployment(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterialDeployment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteMarketingMaterial(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface MarketingMaterialGift {
  id: string
  materialId: string
  campaignId: string | null
  storeName: string
  giftName: string
  allocatedQty: number
  distributedQty: number
  remainingQty: number
  ruleNote: string
  updatedAt: string | null
}

export async function getMarketingMaterialGifts(params?: { campaignId?: string; materialId?: string }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.materialId) q.set('materialId', params.materialId)
  const res = await apiFetchWithOffline('/api/marketingMaterialGifts' + (q.toString() ? '?' + q.toString() : ''))
  return jsonAsArray<MarketingMaterialGift>(await res.json())
}

export async function saveMarketingMaterialGift(params: {
  id?: string
  materialId: string
  campaignId?: string | null
  storeName: string
  giftName: string
  allocatedQty?: number
  distributedQty?: number
  remainingQty?: number
  ruleNote?: string
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingMaterialGifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function deleteMarketingMaterialGift(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingMaterialGift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMarketingMaterialLookup(ids: string[]) {
  const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))].slice(0, 200)
  if (uniq.length === 0) return []
  const res = await apiFetchWithOffline(
    `/api/marketingMaterialLookup?ids=${encodeURIComponent(uniq.join(','))}`
  )
  return jsonAsArray<{ id: string; name: string; campaignId: string | null }>(await res.json())
}
