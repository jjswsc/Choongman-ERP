/**
 * 입고 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface InboundHistoryItem {
  date: string
  vendor: string
  name: string
  spec: string
  qty: number
  po_no?: string | null
  invoice_no?: string | null
  invoice_received?: boolean
  amount: number
  vatAmount?: number
  inbound_batch_id?: number | null
  po_created_at?: string | null
  code?: string
  purchaseSource?: 'hq' | 'store'
  /** 통장 매입 지급만 등록된 건(stock_logs 없음) */
  bank_transaction_id?: number
  row_kind?: 'stock' | 'bank_purchase_payment'
}

export interface InboundBatchDetail {
  id: number
  location: string
  vendorName: string
  vendorCode?: string | null
  batchDate: string
  totalAmount: number
  purchaseOrderId?: number | null
  poNo?: string | null
  invoiceNo?: string | null
  invoicePhotoUrl?: string | null
  items: { code: string; name: string; spec: string; qty: number; unitCost: number; amount: number }[]
}

export async function getInboundBatch(batchId: number) {
  const res = await apiFetchWithOffline(`/api/getInboundBatch?batchId=${batchId}`)
  return res.json() as Promise<InboundBatchDetail>
}

export async function updateInboundBatch(params: {
  batchId: number
  vendorName?: string
  vendorCode?: string
  poNo?: string
  invoiceNo?: string
  invoiceReceived?: boolean
  purchaseOrderId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/updateInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteInboundBatch(batchId: number) {
  const res = await apiFetchWithOffline('/api/deleteInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function registerInboundBatch(
  list: {
    date?: string
    vendor: string
    code: string
    name?: string
    spec?: string
    qty: number | string
    cost?: number | string
  }[],
  storeName?: string,
  options?: { vendorCode?: string; purchaseOrderId?: number; poNo?: string; invoiceNo?: string }
) {
  const res = await apiFetchWithOffline('/api/registerInboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      list,
      storeName: storeName || undefined,
      vendorCode: options?.vendorCode || undefined,
      purchaseOrderId: options?.purchaseOrderId || undefined,
      poNo: options?.poNo || undefined,
      invoiceNo: options?.invoiceNo || undefined,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getInboundHistory(params: {
  startStr: string
  endStr: string
  vendorFilter?: string
  /** 드롭다운 미선택 시 거래처명 부분 검색 */
  vendorSearch?: string
  /** 품목 코드·품목명 부분 검색 */
  itemSearch?: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
    ...(params.vendorSearch?.trim() ? { vendorSearch: params.vendorSearch.trim() } : {}),
    ...(params.itemSearch?.trim() ? { itemSearch: params.itemSearch.trim() } : {}),
    ...(params.storeFilter ? { storeFilter: params.storeFilter } : {}),
  })
  const res = await apiFetchWithOffline(`/api/getInboundHistory?${q}`)
  return jsonAsArray<InboundHistoryItem>(await res.json())
}

export async function getInboundForStore(params: {
  storeName: string
  startStr: string
  endStr: string
  vendorFilter?: string
  vendorSearch?: string
  itemSearch?: string
}) {
  const q = new URLSearchParams({
    storeName: params.storeName,
    startStr: params.startStr,
    endStr: params.endStr,
    ...(params.vendorFilter ? { vendorFilter: params.vendorFilter } : {}),
    ...(params.vendorSearch?.trim() ? { vendorSearch: params.vendorSearch.trim() } : {}),
    ...(params.itemSearch?.trim() ? { itemSearch: params.itemSearch.trim() } : {}),
  })
  const res = await apiFetchWithOffline(`/api/getInboundForStore?${q}`)
  return jsonAsArray<InboundHistoryItem>(await res.json())
}
