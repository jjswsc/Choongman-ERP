/**
 * 계정과목 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface AccountSubjectItem {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
  type: string
  pAndLSection?: string | null
  sortOrder: number
  statementType?: string | null
  normalSide?: string | null
  parentId?: number | null
  isHeader?: boolean
  isSystem?: boolean
  coaClass?: string | null
}

export async function getAccountSubjects(params?: {
  type?: string
  forExpense?: boolean
  forFixed?: boolean
  forCost?: boolean
  forTransfer?: boolean
  forRevenue?: boolean
  forCard?: boolean
  forItem?: boolean
  excludeHeaders?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.type) q.set('type', params.type)
  if (params?.forExpense) q.set('forExpense', 'true')
  if (params?.forFixed) q.set('forFixed', 'true')
  if (params?.forCost) q.set('forCost', 'true')
  if (params?.forTransfer) q.set('forTransfer', 'true')
  if (params?.forRevenue) q.set('forRevenue', 'true')
  if (params?.forCard) q.set('forCard', 'true')
  if (params?.forItem) q.set('forItem', 'true')
  if (params?.excludeHeaders) q.set('excludeHeaders', 'true')
  const res = await apiFetchWithOffline(`/api/getAccountSubjects?${q}`)
  return jsonAsArray<AccountSubjectItem>(await res.json())
}

export async function saveAccountSubject(params: {
  id?: number
  code: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
  type: string
  pAndLSection?: string | null
  sortOrder?: number
  parentId?: number | null
  isHeader?: boolean
  statementType?: string | null
  normalSide?: string | null
  coaClass?: string | null
}) {
  const res = await apiFetchWithOffline('/api/saveAccountSubject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteAccountSubject(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteAccountSubject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
