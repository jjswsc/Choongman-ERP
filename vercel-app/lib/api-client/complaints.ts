/**
 * 컴플레인 일지 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface ComplaintLogItem {
  row?: number
  id?: number
  number: string
  date: string
  time: string
  store: string
  writer: string
  customer: string
  contact: string
  visitPath: string
  platform: string
  type: string
  menu: string
  title: string
  content: string
  severity: string
  action: string
  status: string
  handler: string
  doneDate: string
  photoUrl: string
  remark: string
  memberId?: number | null
  sourceChannel?: string
  createdAt?: string
}

export async function getComplaintLogList(params: {
  startStr?: string
  endStr?: string
  store?: string
  visitPath?: string
  typeFilter?: string
  statusFilter?: string
  sourceChannel?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store) q.set('store', params.store)
  if (params.visitPath) q.set('visitPath', params.visitPath)
  if (params.typeFilter) q.set('typeFilter', params.typeFilter)
  if (params.statusFilter) q.set('statusFilter', params.statusFilter)
  if (params.sourceChannel) q.set('sourceChannel', params.sourceChannel)
  const res = await apiFetchWithOffline(`/api/getComplaintLogList?${q}`)
  return jsonAsArray<ComplaintLogItem>(await res.json())
}

export async function saveComplaintLog(data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/saveComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updateComplaintLog(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/updateComplaintLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowOrId, data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
