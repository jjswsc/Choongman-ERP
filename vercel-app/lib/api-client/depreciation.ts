/**
 * 감가상각·고정자산 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'

export async function getFixedAssets(params: { storeFilter?: string; status?: string }) {
  const q = new URLSearchParams()
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.status) q.set('status', params.status)
  const res = await apiFetchWithOffline(`/api/getFixedAssets?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return { success: o.success === true, list: jsonAsArray(o.list) }
}

export async function saveFixedAsset(params: {
  id?: number
  assetCode?: string
  name: string
  storeName?: string
  acquisitionDate: string
  acquisitionCost: number
  residualRate?: number
  usefulLifeMonths?: number
  depreciationMethod?: string
  memo?: string
  assetAccountCode?: string
  accumulatedDepreciationAccountCode?: string
  depreciationExpenseAccountCode?: string
}) {
  const res = await apiFetchWithOffline('/api/saveFixedAsset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function setFixedAssetStatus(params: {
  id: number
  action: 'dispose' | 'restore'
  disposedAt?: string
  disposalProceeds?: number
  disposalGainAccountCode?: string
  disposalLossAccountCode?: string
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/saveFixedAsset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getDepreciationEntries(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/getDepreciationEntries?${q}`)
  const raw: unknown = await res.json()
  const o = jsonAsPlainObject(raw)
  return {
    success: o.success === true,
    list: jsonAsArray(o.list),
    totalAmount: Number(o.totalAmount) || 0,
  }
}

export async function runDepreciationPreview(params: { yearMonth: string; storeFilter?: string }) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  const res = await apiFetchWithOffline(`/api/runDepreciation?${q}`)
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false, candidates: [], totalAmount: 0 }
  }
  const o = raw as Record<string, unknown>
  return {
    success: o.success === true,
    candidates: jsonAsArray<{
      id: number
      name: string
      store_name: string
      monthly_amount: number
    }>(o.candidates),
    totalAmount: Number(o.totalAmount) || 0,
  }
}

export async function runDepreciation(params: { yearMonth: string; storeFilter?: string; dryRun?: boolean }) {
  const res = await apiFetchWithOffline('/api/runDepreciation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; created?: number; totalAmount?: number; message?: string }>
}

export async function addBalanceTransaction(params: {
  type: 'payable' | 'receivable'
  vendorCode?: string
  storeName?: string
  amount: number
  transDate: string
  memo?: string
  isOpening?: boolean
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/addBalanceTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateManualBalanceTransaction(params: {
  type: 'payable' | 'receivable'
  id: number
  amount: number
  transDate: string
  memo?: string
  storeName?: string
  vendorCode?: string
}) {
  const res = await apiFetchWithOffline('/api/updateManualBalanceTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteManualBalanceTransaction(params: {
  type: 'payable' | 'receivable'
  id: number
}) {
  const res = await apiFetchWithOffline('/api/deleteManualBalanceTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateReceivableReceiveCheck(params: {
  id: number
  receiveChecked: boolean
  receiveDate?: string
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updateReceivableReceiveCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: number; receiveChecked?: boolean }>
}
