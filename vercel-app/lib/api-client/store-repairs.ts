/**
 * 매장 수리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface StoreRepairTicketItem {
  row?: number
  id?: number
  ticketNumber: string
  store: string
  reporter: string
  category: string
  priority: string
  area: string
  title: string
  description: string
  photoUrls: string[]
  status: string
  handler: string
  reportedAt: string
  startedAt: string
  completedAt: string
  resolutionNote: string
  vendorName: string
  vendorCode?: string
  estimatedCost: number | null
  actualCost: number | null
}

export async function getStoreRepairTicketList(params: {
  startStr?: string
  endStr?: string
  store?: string
  status?: string
  category?: string
  priority?: string
  q?: string
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set('startStr', params.startStr)
  if (params.endStr) q.set('endStr', params.endStr)
  if (params.store) q.set('store', params.store)
  if (params.status) q.set('status', params.status)
  if (params.category) q.set('category', params.category)
  if (params.priority) q.set('priority', params.priority)
  if (params.q) q.set('q', params.q)
  const res = await apiFetchWithOffline(`/api/getStoreRepairTicketList?${q}`)
  return jsonAsArray<StoreRepairTicketItem>(await res.json())
}

export async function saveStoreRepairTicket(data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/saveStoreRepairTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string; ticketNumber?: string }>
}

export async function updateStoreRepairTicket(rowOrId: string | number, data: Record<string, unknown>) {
  const res = await apiFetchWithOffline('/api/updateStoreRepairTicket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowOrId, data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 오프라인 큐 미사용 — 파일은 Supabase로 직접 PUT */
export async function uploadStoreRepairPhoto(store: string, file: File) {
  const { guessStoreRepairUploadContentType } = await import('@/lib/store-repair-media')
  const { apiFetch } = await import('../api/fetch')
  const pres = await apiFetch('/api/uploadStoreRepairPhoto/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store,
      fileName: file.name,
      contentType: guessStoreRepairUploadContentType(file),
      fileSize: file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const ct = guessStoreRepairUploadContentType(file)
  const body =
    file.type === ct ? file : new File([file], file.name || 'upload', { type: ct, lastModified: file.lastModified })
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, body, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

export type StoreOpsAlertSummary = {
  today: string
  totalStores: number
  checkedToday: number
  uncheckedToday: number
  staleRepairs: number
  openComplaints: number
}

export async function getStoreOpsAlertSummary(): Promise<StoreOpsAlertSummary> {
  const res = await apiFetchWithOffline('/api/getStoreOpsAlertSummary')
  return (await res.json()) as StoreOpsAlertSummary
}

export type StockTakeKpiStore = {
  store: string
  stockTakeDone: boolean
  adjustmentCount: number
  adjustmentItemCount: number
  lastAdjYmd: string
}

export type StockTakeKpiResponse = {
  yearMonth: string
  startYmd: string
  endYmd: string
  windowStart: string
  windowEnd: string
  dueStartYmd?: string
  dueEndYmd?: string
  inDueWindow: boolean
  totalStores: number
  doneCount: number
  missingCount: number
  stores: StockTakeKpiStore[]
}

export async function getStockTakeKpi(yearMonth?: string): Promise<StockTakeKpiResponse> {
  const q = yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) ? `?yearMonth=${yearMonth}` : ''
  const res = await apiFetchWithOffline(`/api/getStockTakeKpi${q}`)
  return (await res.json()) as StockTakeKpiResponse
}

/** 컴플레인 증빙 사진 업로드 */
export async function uploadComplaintPhoto(store: string, file: File) {
  const { apiFetch } = await import('../api/fetch')
  const ct = file.type || 'image/jpeg'
  const pres = await apiFetch('/api/uploadComplaintPhoto/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store,
      fileName: file.name,
      contentType: ct,
      fileSize: file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const body =
    file.type === ct ? file : new File([file], file.name || 'upload', { type: ct, lastModified: file.lastModified })
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, body, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

/** SSO 제출 증빙 파일 업로드 (브라우저 -> Supabase Storage 직접 PUT) */
export async function uploadSsoEvidenceFile(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  file: File
}) {
  const { apiFetch } = await import('../api/fetch')
  const pres = await apiFetch('/api/uploadSsoEvidence/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userRole: params.userRole,
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter || '',
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

/** E-Tax Time Stamp 증빙 파일 업로드 (브라우저 -> Supabase Storage 직접 PUT) */
export async function uploadEtaxEvidenceFile(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
  file: File
}) {
  const { apiFetch } = await import('../api/fetch')
  const pres = await apiFetch('/api/uploadEtaxEvidence/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userRole: params.userRole,
      yearMonth: params.yearMonth,
      storeFilter: params.storeFilter || '',
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined }
}

export function getExportEtaxTimestampAuditCsvUrl(params: {
  userRole: string
  yearMonth: string
  storeFilter?: string
}) {
  const q = new URLSearchParams({
    userRole: params.userRole,
    yearMonth: params.yearMonth,
    storeFilter: params.storeFilter || 'All',
  })
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/exportEtaxTimestampAuditCsv?${q}`
  }
  return `/api/exportEtaxTimestampAuditCsv?${q}`
}

export interface StoreRepairProgressLog {
  id?: number
  ticketId?: number
  author: string
  note: string
  photoUrls: string[]
  createdAt: string
}

export async function getStoreRepairProgressLogs(ticketId: number) {
  const res = await apiFetchWithOffline(`/api/getStoreRepairProgressLogs?ticketId=${ticketId}`)
  return jsonAsArray<StoreRepairProgressLog>(await res.json())
}

export async function addStoreRepairProgressLog(data: {
  ticketId: number
  author: string
  note: string
  photoUrls?: string[]
}) {
  const res = await apiFetchWithOffline('/api/addStoreRepairProgressLog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
