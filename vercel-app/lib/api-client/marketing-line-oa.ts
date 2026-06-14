/**
 * LINE OA 세그먼트·그룹 API — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'

/** LINE OA Segment API — 세그먼트 목록 (서버 프록시, X-API-KEY는 env) */
export async function getLineOaSegments(params?: {
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/segments' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트 상세 (서버 프록시, X-API-KEY는 env) */
export async function getLineOaSegmentById(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(`/api/lineOa/segments/${encodeURIComponent(normalized)}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: number
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트로 OA Audience 생성 */
export async function createLineOaAudienceFromSegment(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalized)}/create-oa-audience`,
    { method: 'POST' }
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — OA Audience 생성 상태/오디언스명 조회 */
export async function getLineOaAudienceCreateResult(segmentId: number | string, id: number | string) {
  const normalizedSegmentId = String(segmentId ?? '').trim()
  const normalizedId = String(id ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalizedSegmentId)}/create-oa-audience/${encodeURIComponent(
      normalizedId
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — 세그먼트 사용자 목록 CSV 생성 요청 (202 + id, 이후 상태/다운로드는 별도 API) */
export async function requestLineOaSegmentUserListCsv(segmentId: number | string) {
  const normalized = String(segmentId ?? '').trim()
  const res = await apiFetch(`/api/lineOa/segments/${encodeURIComponent(normalized)}/user-list-csv`, {
    method: 'POST',
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Segment API — CSV 보내기 상태·다운로드 URL (결과 3일, URL 10분 유효 — LINE 문서) */
export async function getLineOaSegmentUserListExportStatus(segmentId: number | string, id: number | string) {
  const normalizedSegmentId = String(segmentId ?? '').trim()
  const normalizedId = String(id ?? '').trim()
  const res = await apiFetch(
    `/api/lineOa/segments/${encodeURIComponent(normalizedSegmentId)}/user-list-csv/${encodeURIComponent(
      normalizedId
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    segmentId?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API (Deprecated) — 그룹 목록 */
export async function getLineOaGroups(params?: {
  groupIds?: string
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.groupIds) q.set('groupIds', params.groupIds)
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/groups' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 그룹 생성 */
export async function createLineOaGroup(params: { name: string; retention?: 'P90D' | 'P180D' | 'P365D' }) {
  const res = await apiFetch('/api/lineOa/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 그룹 단건 조회 */
export async function getLineOaGroupById(id: string) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 그룹 수정 */
export async function patchLineOaGroup(
  id: string,
  params: { name?: string; retention?: 'P90D' | 'P180D' | 'P365D' }
) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 그룹 삭제 (204 시 본문 없음) */
export async function deleteLineOaGroup(id: string) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(id.trim())}`, { method: 'DELETE' })
  if (res.status === 204) return { success: true as const, status: 204 }
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; raw?: unknown; status?: number; body?: unknown }>
}

/** LINE OA Group API — 사용자 연결(append/overwrite) */
export async function associateLineOaGroupUsers(
  groupId: string,
  params: { mode: 'append' | 'overwrite'; uids: string[] }
) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/associate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — 사용자 연결 해제 */
export async function dissociateLineOaGroupUsers(groupId: string, params: { uids: string[] }) {
  const res = await apiFetch(`/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/dissociate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API — associate/dissociate 작업 상태 */
export async function getLineOaGroupUserOperation(groupId: string, requestId: string) {
  const res = await apiFetch(
    `/api/lineOa/groups/${encodeURIComponent(groupId.trim())}/users/operations/${encodeURIComponent(
      requestId.trim()
    )}`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** LINE OA Group API V2 — 그룹 목록 (sort: friendCount 등) */
export async function getLineOaGroupV2List(params?: {
  groupIds?: string
  page?: number
  size?: number
  sort?: string
  search?: string
}) {
  const q = new URLSearchParams()
  if (params?.groupIds) q.set('groupIds', params.groupIds)
  if (params?.page != null) q.set('page', String(params.page))
  if (params?.size != null) q.set('size', String(params.size))
  if (params?.sort) q.set('sort', params.sort)
  if (params?.search) q.set('search', params.search)
  const suffix = q.toString()
  const res = await apiFetch('/api/lineOa/group-v2/groups' + (suffix ? `?${suffix}` : ''))
  return res.json() as Promise<{
    success: boolean
    message?: string
    code?: string
    page?: number
    size?: number
    sort?: string
    data?: unknown
    total?: number
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

export async function createLineOaGroupV2(params: { name: string; retention?: 'P90D' | 'P180D' | 'P365D' }) {
  const res = await apiFetch('/api/lineOa/group-v2/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

export async function getLineOaGroupV2ById(id: string) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    data?: unknown
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

export async function patchLineOaGroupV2(
  id: string,
  params: { name?: string; retention?: 'P90D' | 'P180D' | 'P365D' }
) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; data?: unknown; raw?: unknown; status?: number; body?: unknown }>
}

export async function deleteLineOaGroupV2(id: string) {
  const res = await apiFetch(`/api/lineOa/group-v2/groups/${encodeURIComponent(id.trim())}`, { method: 'DELETE' })
  if (res.status === 204) return { success: true as const, status: 204 }
  return res.json() as Promise<{ success: boolean; message?: string; id?: string; raw?: unknown; status?: number; body?: unknown }>
}

/** Group V2 — 그룹 사용자 CSV 생성 요청 (202 + id) */
export async function requestLineOaGroupV2GroupedUsersCsv(groupId: string) {
  const res = await apiFetch(
    `/api/lineOa/group-v2/groups/${encodeURIComponent(groupId.trim())}/grouped-users`,
    { method: 'POST' }
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    id?: string
    raw?: unknown
    status?: number
    body?: unknown
  }>
}

/** Group V2 — CSV 상태·다운로드 URL (결과 약 7일, URL 약 10분 — LINE 문서) */
export async function getLineOaGroupV2GroupedUsersResult(groupId: string, requestId: string) {
  const res = await apiFetch(
    `/api/lineOa/group-v2/groups/${encodeURIComponent(groupId.trim())}/grouped-users/${encodeURIComponent(
      requestId.trim()
    )}/result`
  )
  return res.json() as Promise<{
    success: boolean
    message?: string
    groupId?: string
    requestId?: string
    /** 성공 시 LINE export 상태 문자열, 실패 시 프록시의 HTTP 상태 숫자일 수 있음 */
    status?: string | number
    url?: string
    raw?: unknown
    body?: unknown
  }>
}
