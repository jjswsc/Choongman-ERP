/**
 * 매장 점검 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getChecklistItemsWithCache, getCheckHistoryWithCache } from '../offline/erp-offline'

export interface ChecklistItem {
  id: number
  main: string
  sub: string
  name: string
  use?: boolean
}

export async function getChecklistItems(activeOnly = true) {
  return getChecklistItemsWithCache(activeOnly)
}

export async function saveCheckResult(params: {
  id?: string
  date: string
  store: string
  inspector: string
  summary: string
  memo: string
  jsonData: string | unknown
}) {
  const res = await apiFetchWithOffline('/api/saveCheckResult', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return data.result as 'SAVED' | 'UPDATED'
}

export interface CheckHistoryItem {
  id: string
  date: string
  store: string
  inspector: string
  result: string
  memo?: string
  json?: string
}

export async function getCheckHistory(params: {
  startStr: string
  endStr: string
  store?: string
  inspector?: string
}) {
  return getCheckHistoryWithCache(params)
}

export async function deleteCheckHistory(id: string) {
  const res = await apiFetchWithOffline('/api/deleteCheckHistory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '삭제 실패')
  return true
}

export async function updateChecklistItems(updates: { id: string | number; main?: string; sub?: string; name?: string; use?: boolean; sort_order?: number }[]) {
  const res = await apiFetchWithOffline('/api/updateChecklistItems', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.msg || '저장 실패')
  return true
}

export async function addChecklistItem(params: { main?: string; sub?: string; name?: string }) {
  const res = await apiFetchWithOffline('/api/addChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; id?: number; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '추가 실패')
  return data
}

export async function deleteChecklistItem(id: string | number) {
  const res = await apiFetchWithOffline('/api/deleteChecklistItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  if (!res.ok || !data.success) throw new Error(data.message || '삭제 실패')
  return true
}

export async function uploadStoreCheckPhoto(
  store: string,
  date: string,
  itemId: number,
  phase: 'before' | 'after',
  file: File
): Promise<{ success: boolean; url?: string; message?: string }> {
  const { apiFetch } = await import('../api/fetch')
  const pres = await apiFetch('/api/uploadStoreCheckPhoto/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store,
      date,
      itemId,
      phase,
      fileName: file.name,
      contentType: file.type || 'image/jpeg',
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
  const ct = file.type || 'image/jpeg'
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
