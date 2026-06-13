/**
 * 마케팅 캠페인 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { MarketingCollabDetail } from '../marketing-collab-detail'
import type { MarketingCampaignPhasePeriod } from '../marketing-campaign-periods'
import { apiJsonArrayResponse } from './helpers'

export interface MarketingCampaign {
  id: string
  campaignNo?: string
  topic: string
  format: string
  campaignType?: string
  status: string
  startDate?: string | null
  endDate?: string | null
  /** 캠페인 디자인 작업 일정 */
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  /** 차수별 기간(1차·2차·…) — DB phase_periods */
  phasePeriods?: MarketingCampaignPhasePeriod[]
  branches: string[]
  kpiTarget: number
  kpiUnit: string
  budgetTotal: number
  /** 목록 API에서 함께 내려옴 — 협업·할인 요약 표시용 */
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  /** 캠페인 편집에서 「협업 관리」목록 포함 여부 */
  collabManagement?: boolean
  /** 목록 API에 포함(협업 관리 매장별 조회 등) */
  collabDetail?: MarketingCollabDetail
}

export type { MarketingCollabDetail } from '../marketing-collab-detail'

export interface MarketingCampaignDetail extends MarketingCampaign {
  detail: string
  discountType: string
  discountValue: number
  discountPricePromotion: string
  discountTargetAudience: string
  /** 협업 관리 화면 전용 세부 JSON (normalize된 형태) */
  collabDetail?: MarketingCollabDetail
  costAdsOnline: number
  costAdsOffline: number
  costProduction: number
  costFood: number
  costInfluencer: number
  costOther: number
  costOtherLabel: string
  campaignPerformance: string
  conclusion: string
  createdAt?: string
  updatedAt?: string
}

export async function getMarketingCampaigns() {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', { cache: 'no-store' })
  return apiJsonArrayResponse<MarketingCampaign>(res)
}

export async function getMarketingCampaign(id: string) {
  const q = new URLSearchParams({ id })
  const res = await apiFetchWithOffline('/api/marketingCampaigns?' + q.toString())
  return res.json() as Promise<MarketingCampaignDetail | null>
}

export async function saveMarketingCampaignCollabDetail(params: {
  campaignId: string
  collabDetail: Record<string, unknown>
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabDetail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function toggleMarketingCampaignCollabManagement(params: {
  campaignId: string
  enabled: boolean
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignCollabManagementToggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      enabled: params.enabled === true,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getPosCollabCampaigns(params: { storeCode: string }) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode.trim())
  const res = await apiFetchWithOffline('/api/getPosCollabCampaigns?' + q.toString())
  const data = (await res.json()) as {
    campaigns?: {
      id: string
      topic: string
      campaignNo?: string
      collabDetail: MarketingCollabDetail
    }[]
  }
  return Array.isArray(data.campaigns) ? data.campaigns : []
}

export async function getNextCampaignNumber(): Promise<string | null> {
  const res = await apiFetchWithOffline('/api/marketingCampaigns?nextNumber=1')
  const data = (await res.json()) as { campaignNo?: string }
  return data?.campaignNo ?? null
}

export async function saveMarketingCampaign(params: {
  id?: string
  campaignNo?: string
  topic: string
  format?: string
  campaignType?: string
  status?: string
  detail?: string
  startDate?: string | null
  endDate?: string | null
  designStartDate?: string | null
  designEndDate?: string | null
  designNote?: string
  branches?: string[]
  discountType?: string
  discountValue?: number
  discountPricePromotion?: string
  discountTargetAudience?: string
  costAdsOnline?: number
  costAdsOffline?: number
  costProduction?: number
  costFood?: number
  costInfluencer?: number
  costOther?: number
  costOtherLabel?: string
  budgetTotal?: number
  kpiTarget?: number
  kpiUnit?: string
  campaignPerformance?: string
  conclusion?: string
  collabManagement?: boolean
  phasePeriods?: MarketingCampaignPhasePeriod[]
  userRole?: string
  userStore?: string
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; id?: string }>
}

export async function saveMarketingCampaignDesignDates(params: {
  campaignId: string
  designStartDate?: string | null
  designEndDate?: string | null
}) {
  const res = await apiFetchWithOffline('/api/marketingCampaignDesignDates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: params.campaignId.trim(),
      designStartDate: params.designStartDate ?? null,
      designEndDate: params.designEndDate ?? null,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteMarketingCampaign(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deleteMarketingCampaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

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

export async function getMarketingCampaignCosts(campaignId: string) {
  const q = new URLSearchParams({ campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignCosts?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    topic?: string
    startDate?: string
    endDate?: string
    bankCosts?: number
    pettyCosts?: number
    totalCosts?: number
    linkedCosts?: number
    heuristicCosts?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function getMarketingCampaignResults(params: { campaignId: string }) {
  const q = new URLSearchParams({ campaignId: params.campaignId })
  const res = await apiFetchWithOffline(`/api/marketingCampaignResults?${q}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignId?: string
    startDate?: string | null
    endDate?: string | null
    dineInOrders?: number
    deliveryOrders?: number
    carryOutOrders?: number
    totalOrders?: number
    dineInSales?: number
    deliverySales?: number
    carryOutSales?: number
    totalSales?: number
    linkedOrders?: number
    fallbackOrders?: number
    attributionMode?: 'linked' | 'heuristic' | 'hybrid'
    attributionConfidence?: number
  }>
}

export async function importMarketingExcel(file: File, options?: { dryRun?: boolean }) {
  const form = new FormData()
  form.set('file', file)
  if (options?.dryRun) form.set('dryRun', '1')
  const res = await apiFetchWithOffline('/api/importMarketingExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    campaignsInserted?: number
    adsInserted?: number
    influencersInserted?: number
    timelineAdsInserted?: number
    unmappedAds?: number
    unmappedInfluencers?: number
    dryRun?: boolean
    preview?: {
      detectedSheets?: string[]
      campaignCandidates?: number
      adCandidates?: number
      influencerCandidates?: number
      timelineCandidates?: number
      mappedAds?: number
      mappedInfluencers?: number
      warnings?: string[]
    }
  }>
}
