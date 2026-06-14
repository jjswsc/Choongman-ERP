/**
 * POS 결제 수단 설정 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'

export async function getPosPaymentSettings(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosPaymentSettings?' + q.toString())
  return res.json() as Promise<{
    storeCode: string
    cardKeys: string[]
    qrKeys: string[]
    otherKeys: string[]
    deliveryKeys?: string[]
  }>
}

export interface PosPaymentMethodItem {
  id: string
  storeCode: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden: boolean
  sortOrder: number
}

export async function getPosPaymentMethodItems(params: { storeCode?: string }) {
  const q = new URLSearchParams()
  if (params.storeCode?.trim()) q.set('storeCode', params.storeCode.trim())
  const qs = q.toString()
  const url = '/api/getPosPaymentMethodItems' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posPaymentMethodItems:${params.storeCode?.trim() || 'default'}`
  return fetchPosCatalogCached<PosPaymentMethodItem[]>(cacheKey, url, [])
}

export async function savePosPaymentMethodItem(params: {
  id?: string
  storeCode?: string | null
  category: 'card' | 'qr' | 'delivery' | 'other'
  name: string
  hidden?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function deletePosPaymentMethodItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPaymentMethodItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosPaymentSettings(params: {
  storeCode: string
  cardKeys: string[]
  qrKeys: string[]
}) {
  const res = await apiFetchWithOffline('/api/savePosPaymentSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
