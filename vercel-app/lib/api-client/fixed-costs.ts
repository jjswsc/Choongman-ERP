/**
 * 고정비 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface FixedExpenseItem {
  id?: number
  name: string
  monthlyAmount: number
  store: string
  startYearMonth?: string | null
  endYearMonth?: string | null
  memo?: string | null
  accountSubjectId?: number | null
}

export async function getFixedExpenses(params?: { store?: string; userStore?: string; userRole?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  if (params?.userStore) q.set('userStore', params.userStore)
  if (params?.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getFixedExpenses?${q}`)
  return jsonAsArray<FixedExpenseItem>(await res.json())
}

export async function saveFixedExpense(params: {
  id?: number
  name: string
  monthlyAmount: number
  store?: string
  startYearMonth?: string | null
  endYearMonth?: string | null
  memo?: string | null
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveFixedExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteFixedExpense(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteFixedExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
