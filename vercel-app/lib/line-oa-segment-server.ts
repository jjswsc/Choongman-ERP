/**
 * LINE OA Segment API (X-API-KEY) — Fetch segment list 프록시용.
 * 엔드포인트 전체 URL은 제공 문서에 따라 LINE_OA_SEGMENT_LIST_URL 에 설정.
 */

import { getOaplusRequestHeaders } from '@/lib/oaplus-api-headers'

const SORT_FIELDS = new Set(['id', 'friendCount', 'updatedAt'])
const SORT_DIRS = new Set(['asc', 'desc'])

export type LineOaSegmentListParams = {
  page: number
  size: number
  sort: string
  search: string
}

export type LineOaSegmentListParseResult =
  | { ok: true; params: LineOaSegmentListParams }
  | { ok: false; message: string; code?: string }

export type LineOaSegmentIdParseResult =
  | { ok: true; segmentId: number }
  | { ok: false; message: string; code?: string }

export type LineOaSegmentPathIdResult =
  | { ok: true; segmentId: string }
  | { ok: false; message: string; code?: string }

export type LineOaAudienceRequestIdResult =
  | { ok: true; id: string }
  | { ok: false; message: string; code?: string }

/** 문서: page·size는 숫자, sort는 id|friendCount|updatedAt 과 asc|desc (SGM.1.V.* 방지) */
export function parseLineOaSegmentListQuery(searchParams: URLSearchParams): LineOaSegmentListParseResult {
  const pageRaw = searchParams.get('page')
  const sizeRaw = searchParams.get('size')
  const sortRaw = (searchParams.get('sort') ?? 'id:asc').trim()
  const search = (searchParams.get('search') ?? '').trim()

  const pageStr = pageRaw === null || pageRaw === '' ? '' : String(pageRaw).trim()
  const sizeStr = sizeRaw === null || sizeRaw === '' ? '' : String(sizeRaw).trim()

  const page = pageStr === '' ? 1 : Number.parseInt(pageStr, 10)
  const size = sizeStr === '' ? 50 : Number.parseInt(sizeStr, 10)

  const pageOk =
    pageStr === '' ||
    (/^\d+$/.test(pageStr) && Number.isInteger(page) && page >= 1)
  if (!pageOk) {
    return { ok: false, message: "'page'는 1 이상의 정수여야 합니다.", code: 'SGM.1.V.9.8' }
  }

  const sizeOk =
    sizeStr === '' ||
    (/^\d+$/.test(sizeStr) && Number.isInteger(size) && size >= 1 && size <= 500)
  if (!sizeOk) {
    return { ok: false, message: "'size'는 1~500 사이의 정수여야 합니다.", code: 'SGM.1.V.7.8' }
  }

  const colon = sortRaw.indexOf(':')
  if (colon < 1) {
    return { ok: false, message: "sort는 '필드:asc|desc' 형식이어야 합니다.", code: 'SGM.1.V.8.6' }
  }
  const field = sortRaw.slice(0, colon).trim()
  const dir = sortRaw.slice(colon + 1).trim().toLowerCase()
  if (!SORT_FIELDS.has(field) || !SORT_DIRS.has(dir)) {
    return {
      ok: false,
      message: "sort는 id, friendCount, updatedAt 중 하나와 asc 또는 desc만 사용할 수 있습니다.",
      code: 'SGM.1.V.8.6',
    }
  }

  return { ok: true, params: { page, size, sort: `${field}:${dir}`, search } }
}

export function getLineOaSegmentCredentials(): { listUrl: string; apiKey: string } | { error: string } {
  const listUrl = String(process.env.LINE_OA_SEGMENT_LIST_URL || '').trim().replace(/\/$/, '')
  const apiKey = String(
    process.env.LINE_OA_SEGMENT_X_API_KEY || process.env.LINE_OA_SEGMENT_API_KEY || ''
  ).trim()
  if (!listUrl) {
    return { error: 'LINE_OA_SEGMENT_LIST_URL 환경변수에 세그먼트 목록 GET URL(쿼리 제외)을 설정하세요.' }
  }
  if (!apiKey) {
    return { error: 'LINE_OA_SEGMENT_X_API_KEY(또는 LINE_OA_SEGMENT_API_KEY)를 설정하세요.' }
  }
  return { listUrl, apiKey }
}

export function parseLineOaSegmentId(value: string): LineOaSegmentIdParseResult {
  const raw = String(value || '').trim()
  if (!/^\d+$/.test(raw)) {
    return { ok: false, message: "'segmentId'는 숫자여야 합니다." }
  }
  const segmentId = Number.parseInt(raw, 10)
  if (!Number.isInteger(segmentId) || segmentId < 1) {
    return { ok: false, message: "'segmentId'는 1 이상의 정수여야 합니다." }
  }
  return { ok: true, segmentId }
}

export function parseLineOaSegmentPathId(value: string): LineOaSegmentPathIdResult {
  const segmentId = String(value || '').trim()
  if (!segmentId) {
    return { ok: false, message: "'segmentId'가 필요합니다." }
  }
  return { ok: true, segmentId }
}

export function parseLineOaAudienceRequestId(value: string): LineOaAudienceRequestIdResult {
  const id = String(value || '').trim()
  if (!id) {
    return { ok: false, message: "'id'가 필요합니다." }
  }
  return { ok: true, id }
}

function getLineOaSegmentDetailUrl(segmentId: number): string {
  const configured = String(process.env.LINE_OA_SEGMENT_DETAIL_URL || '').trim().replace(/\/$/, '')
  if (configured) {
    if (configured.includes('{segmentId}')) {
      return configured.replace('{segmentId}', encodeURIComponent(String(segmentId)))
    }
    return `${configured}/${encodeURIComponent(String(segmentId))}`
  }
  const creds = getLineOaSegmentCredentials()
  if ('error' in creds) {
    throw new Error(creds.error)
  }
  return `${creds.listUrl}/${encodeURIComponent(String(segmentId))}`
}

function getLineOaSegmentUserListCsvUrl(segmentId: string): string {
  const configured = String(process.env.LINE_OA_SEGMENT_USER_LIST_CSV_URL || '').trim().replace(/\/$/, '')
  if (!configured) {
    throw new Error(
      'LINE_OA_SEGMENT_USER_LIST_CSV_URL 환경변수에 세그먼트 사용자 CSV 생성 POST URL(권장: {segmentId} 포함)을 설정하세요.'
    )
  }
  if (configured.includes('{segmentId}')) {
    return configured.replace('{segmentId}', encodeURIComponent(segmentId))
  }
  return `${configured}/${encodeURIComponent(segmentId)}`
}

function getLineOaSegmentUserListExportStatusUrl(segmentId: string, id: string): string {
  const configured = String(process.env.LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!configured) {
    throw new Error(
      'LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL 환경변수에 CSV 보내기 상태·다운로드 URL 조회 GET URL(권장: {segmentId}, {id} 포함)을 설정하세요.'
    )
  }
  let resolved = configured
  if (resolved.includes('{segmentId}')) {
    resolved = resolved.replace('{segmentId}', encodeURIComponent(segmentId))
  } else {
    resolved = `${resolved}/${encodeURIComponent(segmentId)}`
  }
  if (resolved.includes('{id}')) {
    resolved = resolved.replace('{id}', encodeURIComponent(id))
  } else {
    resolved = `${resolved}/${encodeURIComponent(id)}`
  }
  return resolved
}

function getLineOaCreateAudienceUrl(segmentId: string): string {
  const configured = String(process.env.LINE_OA_SEGMENT_CREATE_AUDIENCE_URL || '').trim().replace(/\/$/, '')
  if (!configured) {
    throw new Error(
      'LINE_OA_SEGMENT_CREATE_AUDIENCE_URL 환경변수에 OA Audience 생성 POST URL(권장: {segmentId} 포함)을 설정하세요.'
    )
  }
  if (configured.includes('{segmentId}')) {
    return configured.replace('{segmentId}', encodeURIComponent(segmentId))
  }
  return `${configured}/${encodeURIComponent(segmentId)}`
}

function getLineOaCreateAudienceResultUrl(segmentId: string, id: string): string {
  const configured = String(process.env.LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!configured) {
    throw new Error(
      'LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL 환경변수에 OA Audience 상태 조회 GET URL(권장: {segmentId}, {id} 포함)을 설정하세요.'
    )
  }
  let resolved = configured
  if (resolved.includes('{segmentId}')) {
    resolved = resolved.replace('{segmentId}', encodeURIComponent(segmentId))
  } else {
    resolved = `${resolved}/${encodeURIComponent(segmentId)}`
  }
  if (resolved.includes('{id}')) {
    resolved = resolved.replace('{id}', encodeURIComponent(id))
  } else {
    resolved = `${resolved}/${encodeURIComponent(id)}`
  }
  return resolved
}

export async function fetchLineOaSegmentList(params: LineOaSegmentListParams): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }

  const q = new URLSearchParams()
  q.set('page', String(params.page))
  q.set('size', String(params.size))
  q.set('sort', params.sort)
  if (params.search) q.set('search', params.search)

  const url = `${cred.listUrl}?${q.toString()}`
  return fetch(url, {
    method: 'GET',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}

export async function fetchLineOaSegmentDetail(segmentId: number): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }
  const url = getLineOaSegmentDetailUrl(segmentId)
  return fetch(url, {
    method: 'GET',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}

/** 세그먼트 사용자 목록 CSV 생성 요청 — 202 + { id } (상태·다운로드 URL은 별도 API) */
export async function requestLineOaSegmentUserListCsv(segmentId: string): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }
  const url = getLineOaSegmentUserListCsvUrl(segmentId)
  return fetch(url, {
    method: 'POST',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}

/** CSV 보내기 완료 후 상태·다운로드 URL (결과 3일 보관, 다운로드 URL은 응답 후 10분 유효 — LINE 문서) */
export async function fetchLineOaSegmentUserListExportStatus(segmentId: string, id: string): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }
  const url = getLineOaSegmentUserListExportStatusUrl(segmentId, id)
  return fetch(url, {
    method: 'GET',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}

export async function createLineOaAudienceFromSegment(segmentId: string): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }
  const url = getLineOaCreateAudienceUrl(segmentId)
  return fetch(url, {
    method: 'POST',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}

export async function fetchLineOaCreateAudienceResult(segmentId: string, id: string): Promise<Response> {
  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    throw new Error(cred.error)
  }
  const url = getLineOaCreateAudienceResultUrl(segmentId, id)
  return fetch(url, {
    method: 'GET',
    headers: getOaplusRequestHeaders(cred.apiKey),
    cache: 'no-store',
  })
}
