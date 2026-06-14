/**
 * 인테리어 자재·비용·파일·주방·시방 API — interior.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface InteriorMaterialSpec {
  id?: number
  projectId?: number
  materialCode?: string
  materialName?: string
  spec?: string
  supplier?: string
  unit?: string
  unitCost?: number
  imageUrl?: string
  location?: string
  note?: string
  sortOrder?: number
}

export async function getInteriorMaterialSpecs(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorMaterialSpecs?${q}`)
  return jsonAsArray<InteriorMaterialSpec>(await res.json())
}

export async function saveInteriorMaterialSpec(
  params: Partial<InteriorMaterialSpec> & { projectId: number; materialName: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorMaterialSpec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorMaterialSpec(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorMaterialSpec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorExpenseItem {
  id?: number
  projectId?: number
  category?: string
  description?: string
  vendorCode?: string
  quote?: number
  paid?: number
  balance?: number
  paymentSchedule?: unknown[]
  sortOrder?: number
}

export async function getInteriorExpenseItems(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorExpenseItems?${q}`)
  return jsonAsArray<InteriorExpenseItem>(await res.json())
}

export async function saveInteriorExpenseItem(params: Partial<InteriorExpenseItem> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorExpenseItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorExpenseItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorExpenseItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function payInteriorExpense(params: {
  expenseId: number
  accountId: number
  transDate: string
  amount: number
  memo?: string
}) {
  const res = await apiFetchWithOffline('/api/payInteriorExpense', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; bankTransactionId?: number }>
}

export interface InteriorDirectPurchase {
  id?: number
  projectId?: number
  category?: string
  itemNo?: number
  description?: string
  qty?: number
  unit?: string
  price?: number
  sumAmount?: number
  supplierCode?: string
  status?: string
  remark?: string
}

export async function getInteriorDirectPurchases(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorDirectPurchases?${q}`)
  return jsonAsArray<InteriorDirectPurchase>(await res.json())
}

export async function saveInteriorDirectPurchase(params: Partial<InteriorDirectPurchase> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorDirectPurchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorDirectPurchase(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorDirectPurchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorProjectFile {
  id?: number
  projectId?: number
  fileType?: string
  fileName?: string
  filePath?: string
  fileSize?: number
  uploadedAt?: string | null
  quoteAmount?: number
  linkedExpenseId?: number | null
}

export async function getInteriorFiles(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorFiles?${q}`)
  return jsonAsArray<InteriorProjectFile>(await res.json())
}

export async function uploadInteriorFile(params: {
  projectId: string | number
  fileType: string
  file: File
}) {
  const file = params.file
  const pres = await apiFetchWithOffline('/api/uploadInteriorFile/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: String(params.projectId),
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    storagePath?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.storagePath) {
    return {
      success: false,
      message: pjson.message || '업로드 준비 실패',
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const raw = await putRes.text().catch(() => '')
    return {
      success: false,
      message: raw || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  const done = await apiFetchWithOffline('/api/uploadInteriorFile/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: String(params.projectId),
      fileType: params.fileType,
      fileName: file.name,
      fileSize: file.size,
      storagePath: pjson.storagePath,
    }),
  })
  return done.json() as Promise<{ success: boolean; message?: string; url?: string }>
}

export async function deleteInteriorFile(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function saveInteriorProjectFile(params: {
  id: number
  quoteAmount?: number | null
  linkedExpenseId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveInteriorProjectFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function extractInteriorQuoteAmount(params: { fileId: number; projectId: string | number }) {
  const res = await apiFetchWithOffline('/api/extractInteriorQuoteAmount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    amount?: number
    label?: string
    confidence?: string
    method?: string
    openaiUsed?: boolean
  }>
}

export type InteriorLayoutZoneBackground = {
  backgroundFileId?: number | null
  backgroundOpacity?: number
  updatedAt?: string | null
}

export async function getInteriorLayoutZoneBackground(params: {
  projectId: string | number
  zone: string
}) {
  const q = new URLSearchParams({
    projectId: String(params.projectId),
    zone: String(params.zone),
  })
  const res = await apiFetchWithOffline(`/api/getInteriorLayoutZoneBackground?${q}`)
  return res.json() as Promise<InteriorLayoutZoneBackground>
}

export async function saveInteriorLayoutZoneBackground(params: {
  projectId: number
  zone: string
  backgroundFileId?: number | null
  backgroundOpacity?: number
}) {
  const res = await apiFetchWithOffline('/api/saveInteriorLayoutZoneBackground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorKitchenItem {
  id?: number
  projectId?: number
  itemNameKr?: string
  itemNameEn?: string
  sizeMm?: string
  supplierCode?: string
  zone?: string
  price?: number
  quantity?: number
}

export async function getInteriorKitchenItems(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorKitchenItems?${q}`)
  return jsonAsArray<InteriorKitchenItem>(await res.json())
}

export async function saveInteriorKitchenItem(params: Partial<InteriorKitchenItem> & { projectId: number }) {
  const res = await apiFetchWithOffline('/api/saveInteriorKitchenItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorKitchenItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorKitchenItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorSpecification {
  id?: number
  projectId?: number
  description?: string
  code?: string
  size?: string
  supplierCode?: string
  location?: string
}

export async function getInteriorSpecifications(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorSpecifications?${q}`)
  return jsonAsArray<InteriorSpecification>(await res.json())
}

export async function saveInteriorSpecification(params: Partial<InteriorSpecification> & { projectId: number; description: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorSpecification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorSpecification(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorSpecification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
