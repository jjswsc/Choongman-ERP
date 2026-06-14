/**
 * 인사 규정 API — admin.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { NoticeReaderStatsRow } from './admin-notices'

export type HrPolicyRow = {
  id: number
  title?: string
  content?: string
  target_store?: string
  target_role?: string
  target_permission_group?: string | null
  target_recipients?: string | null
  content_version?: number
  created_at?: string
  updated_at?: string
  effective_at?: string | null
  is_active?: boolean
  attachments?: string
  sender?: string
}

export async function getHrPolicies(params?: {
  activeOnly?: boolean
  q?: string
  store?: string
  permissionGroup?: string
  audience?: 'all' | 'office' | 'store' | 'individual'
}): Promise<{
  success: boolean
  items: (HrPolicyRow & { targetSummary?: string })[]
  total?: number
  scoped?: boolean
  message?: string
}> {
  const q = new URLSearchParams()
  if (params?.activeOnly) q.set('activeOnly', '1')
  if (params?.q?.trim()) q.set('q', params.q.trim())
  if (params?.store?.trim()) q.set('store', params.store.trim())
  if (params?.permissionGroup?.trim()) q.set('permissionGroup', params.permissionGroup.trim())
  if (params?.audience && params.audience !== 'all') q.set('audience', params.audience)
  const res = await apiFetchWithOffline(`/api/getHrPolicies?${q}`)
  return (await res.json()) as {
    success: boolean
    items: (HrPolicyRow & { targetSummary?: string })[]
    total?: number
    scoped?: boolean
    message?: string
  }
}

export async function saveHrPolicy(body: {
  id?: number
  title: string
  content: string
  targetStore: string
  targetRole: string
  targetPermissionGroup?: string
  targetRecipients?: Array<{ store: string; name: string }>
  effectiveAt?: string | null
  is_active?: boolean
  attachments?: Array<{ name: string; mime: string; url: string }>
}): Promise<{ success: boolean; message?: string; id?: number; content_version?: number }> {
  const res = await apiFetchWithOffline('/api/saveHrPolicy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: body.id,
      title: body.title,
      content: body.content,
      targetStore: body.targetStore,
      targetRole: body.targetRole,
      targetPermissionGroup: body.targetPermissionGroup,
      targetRecipients: body.targetRecipients,
      effective_at: body.effectiveAt,
      is_active: body.is_active,
      attachments: body.attachments,
    }),
  })
  return (await res.json()) as { success: boolean; message?: string; id?: number; content_version?: number }
}

export type HrPolicyListItem = {
  id: number
  date: string
  title: string
  content: string
  status: string
  needsReconfirm: boolean
  attachments: unknown[]
  contentVersion: number
  effectiveAt: string
}

export async function getMyHrPolicies(params: {
  store: string
  name: string
  page?: number
  pageSize?: number
  status?: 'all' | 'unread' | 'read'
}): Promise<{
  items: HrPolicyListItem[]
  total: number
  page: number
  pageSize: number
  truncated: boolean
}> {
  const q = new URLSearchParams({ store: params.store, name: params.name })
  if (params.page != null) q.set('page', String(params.page))
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
  if (params.status && params.status !== 'all') q.set('status', params.status)
  const res = await apiFetchWithOffline(`/api/getMyHrPolicies?${q}`)
  return (await res.json()) as {
    items: HrPolicyListItem[]
    total: number
    page: number
    pageSize: number
    truncated: boolean
  }
}

export async function confirmHrPolicyRead(params: {
  policyId: number
  store: string
  name: string
  action?: string
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/confirmHrPolicyRead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      policyId: params.policyId,
      store: params.store,
      name: params.name,
      action: params.action,
    }),
  })
  return (await res.json()) as { success: boolean; message?: string }
}

export type HrPolicyReadDetailItem = {
  store: string
  name: string
  read_at: string
  status: string
  acknowledged: boolean
}

export async function getHrPolicyReadDetail(params: { policyId: number }): Promise<{
  items: HrPolicyReadDetailItem[]
  contentVersion: number
}> {
  const q = new URLSearchParams({ policyId: String(params.policyId) })
  const res = await apiFetchWithOffline(`/api/getHrPolicyReadDetail?${q}`)
  const data = (await res.json()) as {
    items?: HrPolicyReadDetailItem[]
    success?: boolean
    contentVersion?: number
    message?: string
  }
  if (!res.ok || data.success === false) throw new Error(data.message || 'Failed')
  return { items: data.items ?? [], contentVersion: data.contentVersion ?? 1 }
}

export async function getHrPolicyReaderStats(params: {
  startDate: string
  endDate: string
  store?: string
  minMissed?: number
}): Promise<{
  success: boolean
  message?: string
  items: NoticeReaderStatsRow[]
  truncated: boolean
  policyInRange: number
}> {
  const q = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  })
  if (params.store) q.set('store', params.store)
  if (params.minMissed != null && params.minMissed > 0) q.set('minMissed', String(params.minMissed))
  const res = await apiFetchWithOffline(`/api/getHrPolicyReaderStats?${q}`)
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    items?: NoticeReaderStatsRow[]
    truncated?: boolean
    policyInRange?: number
  }
  if (!res.ok) {
    return {
      success: false,
      message: data?.message,
      items: [],
      truncated: false,
      policyInRange: 0,
    }
  }
  return {
    success: data.success !== false,
    message: data.message,
    items: Array.isArray(data.items) ? data.items : [],
    truncated: Boolean(data.truncated),
    policyInRange: data.policyInRange ?? 0,
  }
}
