/**
 * 회사 하이브리드 문서 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'

export type CompanyHybridDocumentListItem = {
  id: number
  store: string
  related_type: string
  related_id: string | null
  doc_type: string | null
  category_id: number | null
  title: string
  source: string
  external_url: string | null
  public_url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime: string | null
  valid_from: string | null
  valid_to: string | null
  note: string | null
  metadata?: Record<string, unknown> | null
  created_by_name: string | null
  created_by_store: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CompanyHybridDocumentCategory = {
  id: number
  store: string
  name: string
  sort_order: number
  parent_category_id: number | null
  created_at?: string
}

/** 문서 관리 API: UI에서 401 시 알림 대신 로그인 이동용 */
type CompanyHybridHttpMeta = { httpStatus: number }

export type CompanyHybridDocumentEvent = {
  id: number
  document_id: number
  action: string
  store: string
  actor_name: string | null
  actor_store: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export type CompanyHybridDocumentsSummary = {
  today: string
  total: number
  expiring_soon: number
  expired: number
  corr_overdue: number
  stores: Array<{
    store: string
    total: number
    expiring_soon: number
    expired: number
    compliance_pct: number
  }>
}

export async function getCompanyHybridDocuments(params: {
  store: string
  relatedType?: string
  relatedId?: string
  /** 생략·'all' = 전체, 'uncategorized' = 미분류, 숫자 문자열 = 해당 카테고리 */
  categoryId?: string
  searchTitle?: string
  /** 제목 정렬 — 미지정 시 등록일 최신순 */
  sortTitle?: 'asc' | 'desc'
  sortCreated?: 'asc' | 'desc'
  sortValidTo?: 'asc' | 'desc'
  /** 공문(metadata.correspondence) 유무: all | yes | no */
  corrPresence?: 'all' | 'yes' | 'no'
  corrDirection?: 'outbound' | 'inbound'
  corrStatus?: 'draft' | 'sent' | 'filed' | 'replied'
  corrCounterpartySearch?: string
  sourceFilter?: 'drive' | 'supabase'
  visibilityFilter?: 'all' | 'office' | 'store_admin'
  expiryFilter?: 'all' | 'expiring_soon' | 'expired' | 'no_expiry'
  offset?: number
  limit?: number
}): Promise<
  {
    success: boolean
    list: CompanyHybridDocumentListItem[]
    total?: number
    offset?: number
    limit?: number
    truncated?: boolean
    message?: string
  } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ store: params.store })
  if (params.relatedType) q.set('relatedType', params.relatedType)
  if (params.relatedId) q.set('relatedId', params.relatedId)
  if (params.categoryId && params.categoryId !== 'all') {
    const c = params.categoryId
    q.set('categoryId', c === 'uncategorized' ? 'none' : c)
  }
  if (params.searchTitle?.trim()) q.set('searchTitle', params.searchTitle.trim())
  if (params.sortTitle === 'asc' || params.sortTitle === 'desc') q.set('sortTitle', params.sortTitle)
  if (params.sortCreated === 'asc' || params.sortCreated === 'desc') q.set('sortCreated', params.sortCreated)
  if (params.sortValidTo === 'asc' || params.sortValidTo === 'desc') q.set('sortValidTo', params.sortValidTo)
  if (params.corrPresence && params.corrPresence !== 'all') q.set('corrPresence', params.corrPresence)
  if (params.corrDirection) q.set('corrDirection', params.corrDirection)
  if (params.corrStatus) q.set('corrStatus', params.corrStatus)
  if (params.corrCounterpartySearch?.trim()) q.set('corrCounterpartySearch', params.corrCounterpartySearch.trim())
  if (params.sourceFilter === 'drive' || params.sourceFilter === 'supabase') q.set('source', params.sourceFilter)
  if (params.visibilityFilter && params.visibilityFilter !== 'all') q.set('visibility', params.visibilityFilter)
  if (params.expiryFilter && params.expiryFilter !== 'all') q.set('expiryFilter', params.expiryFilter)
  if (params.offset != null && params.offset >= 0) q.set('offset', String(Math.floor(params.offset)))
  if (params.limit != null && params.limit > 0) q.set('limit', String(Math.floor(params.limit)))
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocuments?${q}`)
  const data = (await res.json()) as {
    success: boolean
    list: CompanyHybridDocumentListItem[]
    total?: number
    offset?: number
    limit?: number
    truncated?: boolean
    message?: string
  }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentCategories(params: {
  store: string
}): Promise<
  { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline(
    `/api/getCompanyHybridDocumentCategories?${new URLSearchParams({ store: params.store })}`
  )
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocumentCategory(
  body: { store: string; name: string; sortOrder?: number; id?: number; parentCategoryId?: number | null }
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocumentCategory(
  body: { id: number }
): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocument(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocument(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function presignCompanyHybridDocumentUpload(params: {
  store: string
  fileName: string
  contentType: string
  fileSize: number
}): Promise<
  {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  }
  return { ...data, httpStatus: res.status }
}

export async function completeCompanyHybridDocumentUpload(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; url?: string; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; url?: string; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function recordCompanyHybridDocumentView(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/recordCompanyHybridDocumentView', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentEvents(params: {
  documentId: number
}): Promise<
  { success: boolean; list: CompanyHybridDocumentEvent[]; message?: string } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ documentId: String(params.documentId) })
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocumentEvents?${q}`)
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentEvent[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentsSummary(params: {
  store: string
}): Promise<
  { success: boolean; summary?: CompanyHybridDocumentsSummary; message?: string } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ store: params.store })
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocumentsSummary?${q}`)
  const data = (await res.json()) as {
    success: boolean
    summary?: CompanyHybridDocumentsSummary
    message?: string
  }
  return { ...data, httpStatus: res.status }
}
