/**
 * 인테리어 프로젝트·일정·업체·레이아웃 API — interior.ts에서 분리 — move only
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
