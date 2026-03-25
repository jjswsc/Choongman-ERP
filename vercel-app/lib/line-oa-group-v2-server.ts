/**
 * LINE OA Group API V2 (/audience/v2/group/groups) — X-API-KEY 프록시용.
 */

import { getOaplusRequestHeaders } from '@/lib/oaplus-api-headers'

const GROUP_V2_SORT_FIELDS = new Set([
  'id',
  'name',
  'friendCount',
  'updatedAt',
  'source',
  'validUntil',
])
const SORT_DIRS = new Set(['asc', 'desc'])

export type LineOaGroupV2ListParams = {
  groupIds: string
  page: number
  size: number
  sort: string
  search: string
}

export type LineOaGroupV2ListParseResult =
  | { ok: true; params: LineOaGroupV2ListParams }
  | { ok: false; message: string; code?: string }

export function parseLineOaGroupV2ListQuery(searchParams: URLSearchParams): LineOaGroupV2ListParseResult {
  const groupIds = (searchParams.get('groupIds') ?? '').trim()
  const pageRaw = searchParams.get('page')
  const sizeRaw = searchParams.get('size')
  const sortRaw = (searchParams.get('sort') ?? 'id:asc').trim()
  const search = (searchParams.get('search') ?? '').trim()

  const pageStr = pageRaw === null || pageRaw === '' ? '' : String(pageRaw).trim()
  const sizeStr = sizeRaw === null || sizeRaw === '' ? '' : String(sizeRaw).trim()

  const page = pageStr === '' ? 1 : Number.parseInt(pageStr, 10)
  const size = sizeStr === '' ? 20 : Number.parseInt(sizeStr, 10)

  const pageOk =
    pageStr === '' || (/^\d+$/.test(pageStr) && Number.isInteger(page) && page >= 1)
  if (!pageOk) {
    return { ok: false, message: "'page'는 1 이상의 정수여야 합니다.", code: 'GRP.1.V.11.8' }
  }

  const sizeOk =
    sizeStr === '' || (/^\d+$/.test(sizeStr) && Number.isInteger(size) && size >= 1 && size <= 500)
  if (!sizeOk) {
    return { ok: false, message: "'size'는 1~500 사이의 정수여야 합니다.", code: 'GRP.1.V.9.8' }
  }

  const colon = sortRaw.indexOf(':')
  if (colon < 1) {
    return { ok: false, message: "sort는 '필드:asc|desc' 형식이어야 합니다.", code: 'GRP.1.V.10.6' }
  }
  const field = sortRaw.slice(0, colon).trim()
  const dir = sortRaw.slice(colon + 1).trim().toLowerCase()
  if (!GROUP_V2_SORT_FIELDS.has(field) || !SORT_DIRS.has(dir)) {
    return {
      ok: false,
      message:
        'sort 필드는 id, name, friendCount, updatedAt, source, validUntil 중 하나와 asc/desc만 허용됩니다.',
      code: 'GRP.1.V.10.6',
    }
  }

  return { ok: true, params: { groupIds, page, size, sort: `${field}:${dir}`, search } }
}

export function getLineOaGroupV2Credentials(): { baseUrl: string; apiKey: string } | { error: string } {
  const baseUrl = String(process.env.LINE_OA_GROUP_V2_API_BASE_URL || '').trim().replace(/\/$/, '')
  const apiKey = String(
    process.env.LINE_OA_GROUP_V2_X_API_KEY ||
      process.env.LINE_OA_GROUP_X_API_KEY ||
      process.env.LINE_OA_SEGMENT_X_API_KEY ||
      process.env.LINE_OA_SEGMENT_API_KEY ||
      ''
  ).trim()
  if (!baseUrl) {
    return {
      error:
        'LINE_OA_GROUP_V2_API_BASE_URL에 Group V2 베이스 URL을 설정하세요 (예: …/audience/v2/group/groups, 끝 슬래시 없음).',
    }
  }
  if (!apiKey) {
    return {
      error:
        'LINE_OA_GROUP_V2_X_API_KEY(또는 LINE_OA_GROUP_X_API_KEY / LINE_OA_SEGMENT_X_API_KEY)를 설정하세요.',
    }
  }
  return { baseUrl, apiKey }
}

function groupV2Headers(apiKey: string, contentTypeJson?: boolean): HeadersInit {
  return getOaplusRequestHeaders(apiKey, { contentTypeJson })
}

export async function fetchLineOaGroupV2List(params: LineOaGroupV2ListParams): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const q = new URLSearchParams()
  if (params.groupIds) q.set('groupIds', params.groupIds)
  q.set('page', String(params.page))
  q.set('size', String(params.size))
  q.set('sort', params.sort)
  if (params.search) q.set('search', params.search)
  const url = `${cred.baseUrl}?${q.toString()}`
  return fetch(url, { method: 'GET', headers: groupV2Headers(cred.apiKey), cache: 'no-store' })
}

export async function createLineOaGroupV2(body: { name: string; retention?: string }): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  return fetch(cred.baseUrl, {
    method: 'POST',
    headers: groupV2Headers(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function fetchLineOaGroupV2ById(id: string): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, { method: 'GET', headers: groupV2Headers(cred.apiKey), cache: 'no-store' })
}

export async function deleteLineOaGroupV2(id: string): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, { method: 'DELETE', headers: groupV2Headers(cred.apiKey), cache: 'no-store' })
}

export async function patchLineOaGroupV2(id: string, body: Record<string, unknown>): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, {
    method: 'PATCH',
    headers: groupV2Headers(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function requestLineOaGroupV2GroupedUsersCsv(groupId: string): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(groupId)}/grouped-users`
  return fetch(url, {
    method: 'POST',
    headers: groupV2Headers(cred.apiKey),
    cache: 'no-store',
  })
}

export async function fetchLineOaGroupV2GroupedUsersResult(groupId: string, requestId: string): Promise<Response> {
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(groupId)}/grouped-users/${encodeURIComponent(requestId)}/result`
  return fetch(url, { method: 'GET', headers: groupV2Headers(cred.apiKey), cache: 'no-store' })
}
