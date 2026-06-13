/**
 * 인테리어 프로젝트 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface InteriorProject {
  id?: number
  code: string
  name: string
  location?: string
  status?: string
  budgetTotal?: number
  startDate?: string | null
  endDate?: string | null
}

export async function getInteriorProjects() {
  const res = await apiFetchWithOffline('/api/getInteriorProjects')
  return jsonAsArray<InteriorProject>(await res.json())
}

export async function saveInteriorProject(params: Partial<InteriorProject> & { code: string; name: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorProject(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorProject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type InteriorProjectDashboardRow = {
  id: number
  paidTotal: number
  scheduleLateCount: number
  vendorDelayedCount: number
  overBudget: boolean
  hasAlert: boolean
}

export type InteriorDashboardTotals = {
  activeProjectCount: number
  scheduleOverdueCount: number
  vendorDelayedCount: number
  overBudgetProjectCount: number
  projectsWithAnyAlert: number
}

export type InteriorDashboardSummary = {
  generatedAt: string
  totals: InteriorDashboardTotals
  projects?: InteriorProjectDashboardRow[]
}

export async function getInteriorDashboardSummary() {
  const res = await apiFetchWithOffline('/api/getInteriorDashboardSummary')
  return res.json() as Promise<InteriorDashboardSummary>
}

export interface InteriorScheduleItem {
  id?: number
  projectId?: number
  itemNo?: number
  workDetail?: string
  startDate?: string | null
  endDate?: string | null
  dayProgress?: Record<string, unknown>
  sortOrder?: number
}

export async function getInteriorSchedule(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorSchedule?${q}`)
  return jsonAsArray<InteriorScheduleItem>(await res.json())
}

export async function saveInteriorScheduleItem(params: Partial<InteriorScheduleItem> & { projectId: number; workDetail: string }) {
  const res = await apiFetchWithOffline('/api/saveInteriorScheduleItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorScheduleItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorScheduleItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorWorkPackage {
  id?: number
  legacyId?: number
  isLegacy?: boolean
  projectId?: number
  partType?: string
  title?: string
  description?: string
  startDate?: string | null
  endDate?: string | null
  status?: 'planned' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | string
  progressPct?: number
  color?: string
  sortOrder?: number
}

export async function getInteriorWorkPackages(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorWorkPackages?${q}`)
  return jsonAsArray<InteriorWorkPackage>(await res.json())
}

export async function saveInteriorWorkPackage(
  params: Partial<InteriorWorkPackage> & { projectId: number; title: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorWorkPackage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorWorkPackage(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorWorkPackage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorVendorDirectoryEntry {
  id?: number
  code?: string
  name?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  specialty?: string
  memo?: string
  useCount?: number
  lastUsedAt?: string | null
  isActive?: boolean
  sortOrder?: number
}

export async function getInteriorVendorDirectory(options?: { includeInactive?: boolean }) {
  const q = new URLSearchParams()
  if (options?.includeInactive) q.set('includeInactive', '1')
  const suffix = q.toString() ? `?${q}` : ''
  const res = await apiFetchWithOffline(`/api/getInteriorVendorDirectory${suffix}`)
  return jsonAsArray<InteriorVendorDirectoryEntry>(await res.json())
}

export async function saveInteriorVendorDirectory(
  params: Partial<InteriorVendorDirectoryEntry> & { name: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorVendorDirectory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorVendorDirectory(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorVendorDirectory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorVendorTrack {
  id?: number
  projectId?: number
  vendorName?: string
  vendorCode?: string
  workPackageId?: number | null
  paymentDueDate?: string | null
  paymentPaidDate?: string | null
  materialEtaDate?: string | null
  materialReceivedDate?: string | null
  workCompletedDate?: string | null
  status?: 'planned' | 'ordered' | 'paid' | 'received' | 'done' | 'delayed' | 'cancelled' | string
  amount?: number
  note?: string
  sortOrder?: number
}

export async function getInteriorVendorTracks(params: { projectId: string | number }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  const res = await apiFetchWithOffline(`/api/getInteriorVendorTracks?${q}`)
  return jsonAsArray<InteriorVendorTrack>(await res.json())
}

export async function saveInteriorVendorTrack(
  params: Partial<InteriorVendorTrack> & { projectId: number; vendorName: string; vendorCode: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorVendorTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorVendorTrack(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorVendorTrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface InteriorLayoutItem {
  id?: number
  projectId?: number
  zone?: 'kitchen' | 'hall' | string
  floor?: string
  x?: number
  y?: number
  w?: number
  h?: number
  rotation?: number
  itemName?: string
  qty?: number
  status?: 'planned' | 'ordered' | 'installed' | 'done' | 'blocked' | string
  materialSpecId?: number | null
  note?: string
  sortOrder?: number
}

export interface InteriorLayoutEditorPrefs {
  duplicateOffsetX?: number
  duplicateOffsetY?: number
  snapEnabled?: boolean
  snapStep?: number
  nudgeSmall?: number
  nudgeMedium?: number
  nudgeLarge?: number
  updatedAt?: string | null
}

export async function getInteriorLayoutItems(params: { projectId: string | number; zone?: string }) {
  const q = new URLSearchParams({ projectId: String(params.projectId) })
  if (params.zone) q.set('zone', String(params.zone))
  const res = await apiFetchWithOffline(`/api/getInteriorLayoutItems?${q}`)
  return jsonAsArray<InteriorLayoutItem>(await res.json())
}

export async function saveInteriorLayoutItem(
  params: Partial<InteriorLayoutItem> & { projectId: number; itemName: string }
) {
  const res = await apiFetchWithOffline('/api/saveInteriorLayoutItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deleteInteriorLayoutItem(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deleteInteriorLayoutItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getInteriorLayoutEditorPrefs(params: {
  projectId: string | number
  zone: string
  userStore: string
  userName: string
  employeeId?: number
}) {
  const q = new URLSearchParams({
    projectId: String(params.projectId),
    zone: String(params.zone),
    userStore: String(params.userStore),
    userName: String(params.userName),
  })
  if (params.employeeId != null && params.employeeId > 0) q.set('employeeId', String(params.employeeId))
  const res = await apiFetchWithOffline(`/api/getInteriorLayoutEditorPrefs?${q}`)
  return res.json() as Promise<InteriorLayoutEditorPrefs>
}

export async function saveInteriorLayoutEditorPrefs(params: {
  projectId: number
  zone: string
  userStore: string
  userName: string
  employeeId?: number
  duplicateOffsetX: number
  duplicateOffsetY: number
  snapEnabled?: boolean
  snapStep?: number
  nudgeSmall?: number
  nudgeMedium?: number
  nudgeLarge?: number
}) {
  const res = await apiFetchWithOffline('/api/saveInteriorLayoutEditorPrefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

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
