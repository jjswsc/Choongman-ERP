/**
 * POS 세금계산서 수신처 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface PosTaxInvoiceRecipientRow {
  id: string
  /** 전 매장 공유 마스터는 `__shared__` */
  store_code: string
  member_id: number | null
  member_no: string | null
  customer_type: 'person' | 'company'
  name: string
  tax_id: string
  branch_no: string
  phone: string
  phone_normalized: string
  email: string
  address: string
  is_active: boolean
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

/** 세금계산서 수취인 검색·목록 (관리자·POS) */
export async function getPosTaxInvoiceRecipients(params: {
  userStore: string
  userRole: string
  storeCode?: string
  q?: string
  by?: 'phone' | 'taxId' | 'name' | 'memberNo'
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('userStore', params.userStore)
  q.set('userRole', params.userRole)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  if (params.q) q.set('q', params.q)
  if (params.by) q.set('by', params.by)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetch(`/api/posTaxInvoiceRecipients?${q}`)
  return res.json() as Promise<{
    success: boolean
    rows?: PosTaxInvoiceRecipientRow[]
    message?: string
  }>
}

/** 세금계산서 수취인 upsert (POS 결제 등) — 오프라인 시 큐 */
export async function upsertPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  storeCode: string
  memberId?: number | null
  memberNo?: string | null
  customerType: 'person' | 'company'
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  source?: string
}) {
  const res = await apiFetchWithOffline('/api/posTaxInvoiceRecipients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}

/** 관리자: 수취인 수정·비활성화 */
export async function patchPosTaxInvoiceRecipient(params: {
  userStore: string
  userRole: string
  id: string
  is_active?: boolean
  notes?: string | null
  name?: string
  taxId?: string
  branchNo?: string
  phone?: string
  email?: string
  address?: string
  customerType?: 'person' | 'company'
  member_id?: number | null
  member_no?: string | null
}) {
  const res = await apiFetch('/api/posTaxInvoiceRecipients', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    row?: PosTaxInvoiceRecipientRow
    message?: string
  }>
}
