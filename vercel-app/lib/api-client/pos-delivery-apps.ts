/**
 * POS 배달앱·Grab 연동 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'

export interface PosDeliveryApp {
  id: number
  code: string
  name: string
  matchKeywords: string[]
  displayOrder: number
  enabled: boolean
  dineOutEnabled: boolean
  accentColor: string | null
  storeCode: string | null
}

export async function getPosDeliveryApps(params?: { storeCode?: string; includeDisabled?: boolean }) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeDisabled) q.set('includeDisabled', 'true')
  const qs = q.toString()
  const url = '/api/getPosDeliveryApps' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posDeliveryApps:${params?.storeCode?.trim() || ''}:${params?.includeDisabled ? '1' : '0'}`
  return fetchPosCatalogCached<PosDeliveryApp[]>(cacheKey, url, [])
}

export async function savePosDeliveryApps(params: {
  storeCode?: string
  items: Array<{
    id?: number
    code: string
    name: string
    matchKeywords?: string[]
    displayOrder?: number
    enabled?: boolean
    dineOutEnabled?: boolean
    accentColor?: string | null
  }>
}) {
  const res = await apiFetchWithOffline('/api/savePosDeliveryApps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface GrabStoreIntegrationSnapshot {
  id: number
  grabMerchantID: string
  partnerMerchantID: string
  integrationStatus: string
  lastRequestID: string | null
  lastMessage: string | null
  payload: unknown
  createdAt: string | null
  updatedAt: string | null
}

export async function getGrabStoreIntegrations(params?: {
  grabMerchantID?: string
  partnerMerchantID?: string
  status?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.grabMerchantID) q.set('grabMerchantID', params.grabMerchantID)
  if (params?.partnerMerchantID) q.set('partnerMerchantID', params.partnerMerchantID)
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  const url = '/api/getGrabStoreIntegrations' + (qs ? `?${qs}` : '')
  const res = await apiFetch(url)
  const json = await res.json()
  return Array.isArray(json) ? (json as GrabStoreIntegrationSnapshot[]) : []
}
