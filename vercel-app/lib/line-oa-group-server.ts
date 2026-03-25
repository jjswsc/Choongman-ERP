/**
 * LINE OA Group API (Deprecated audience/v1/group) — X-API-KEY 프록시용.
 * 베이스: GET/POST /audience/v1/group/groups 까지의 URL (끝에 /groups, 슬래시 없음)
 */

import { getOaplusRequestHeaders } from '@/lib/oaplus-api-headers'

const GROUP_SORT_FIELDS = new Set([
  'id',
  'name',
  'followerCount',
  'updatedAt',
  'source',
  'validUntil',
])
const SORT_DIRS = new Set(['asc', 'desc'])
const RETENTION_VALUES = new Set(['P90D', 'P180D', 'P365D'])

export type LineOaGroupListParams = {
  groupIds: string
  page: number
  size: number
  sort: string
  search: string
}

export type LineOaGroupListParseResult =
  | { ok: true; params: LineOaGroupListParams }
  | { ok: false; message: string; code?: string }

export function parseLineOaGroupListQuery(searchParams: URLSearchParams): LineOaGroupListParseResult {
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
  if (!GROUP_SORT_FIELDS.has(field) || !SORT_DIRS.has(dir)) {
    return {
      ok: false,
      message:
        'sort 필드는 id, name, followerCount, updatedAt, source, validUntil 중 하나와 asc/desc만 허용됩니다.',
      code: 'GRP.1.V.10.6',
    }
  }

  return { ok: true, params: { groupIds, page, size, sort: `${field}:${dir}`, search } }
}

export function getLineOaGroupCredentials(): { baseUrl: string; apiKey: string } | { error: string } {
  const baseUrl = String(process.env.LINE_OA_GROUP_API_BASE_URL || '').trim().replace(/\/$/, '')
  const apiKey = String(
    process.env.LINE_OA_GROUP_X_API_KEY ||
      process.env.LINE_OA_SEGMENT_X_API_KEY ||
      process.env.LINE_OA_SEGMENT_API_KEY ||
      ''
  ).trim()
  if (!baseUrl) {
    return {
      error:
        'LINE_OA_GROUP_API_BASE_URL에 Group API 베이스 URL을 설정하세요 (예: …/audience/v1/group/groups, 끝 슬래시 없음).',
    }
  }
  if (!apiKey) {
    return {
      error:
        'LINE_OA_GROUP_X_API_KEY(또는 Segment와 동일 키: LINE_OA_SEGMENT_X_API_KEY)를 설정하세요.',
    }
  }
  return { baseUrl, apiKey }
}

export function parseLineOaGroupId(value: string): { ok: true; id: string } | { ok: false; message: string } {
  const id = String(value || '').trim()
  if (!id) return { ok: false, message: "'id'가 필요합니다." }
  return { ok: true, id }
}

export function parseLineOaGroupRequestId(value: string): { ok: true; requestId: string } | { ok: false; message: string } {
  const requestId = String(value || '').trim()
  if (!requestId) return { ok: false, message: "'requestId'가 필요합니다." }
  return { ok: true, requestId }
}

function groupHeaders(apiKey: string, contentTypeJson?: boolean): HeadersInit {
  return getOaplusRequestHeaders(apiKey, { contentTypeJson })
}

export async function fetchLineOaGroupList(params: LineOaGroupListParams): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const q = new URLSearchParams()
  if (params.groupIds) q.set('groupIds', params.groupIds)
  q.set('page', String(params.page))
  q.set('size', String(params.size))
  q.set('sort', params.sort)
  if (params.search) q.set('search', params.search)
  const url = `${cred.baseUrl}?${q.toString()}`
  return fetch(url, { method: 'GET', headers: groupHeaders(cred.apiKey), cache: 'no-store' })
}

export async function createLineOaGroup(body: { name: string; retention?: string }): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  return fetch(cred.baseUrl, {
    method: 'POST',
    headers: groupHeaders(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function fetchLineOaGroupById(id: string): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, { method: 'GET', headers: groupHeaders(cred.apiKey), cache: 'no-store' })
}

export async function deleteLineOaGroup(id: string): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, { method: 'DELETE', headers: groupHeaders(cred.apiKey), cache: 'no-store' })
}

export async function patchLineOaGroup(id: string, body: Record<string, unknown>): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}`
  return fetch(url, {
    method: 'PATCH',
    headers: groupHeaders(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function associateLineOaGroupUsers(
  id: string,
  body: { mode: string; uids: string[] }
): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}/users/associate`
  return fetch(url, {
    method: 'POST',
    headers: groupHeaders(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function dissociateLineOaGroupUsers(id: string, body: { uids: string[] }): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}/users/dissociate`
  return fetch(url, {
    method: 'POST',
    headers: groupHeaders(cred.apiKey, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function fetchLineOaGroupUserOperation(id: string, requestId: string): Promise<Response> {
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) throw new Error(cred.error)
  const url = `${cred.baseUrl}/${encodeURIComponent(id)}/users/operations/${encodeURIComponent(requestId)}`
  return fetch(url, { method: 'GET', headers: groupHeaders(cred.apiKey), cache: 'no-store' })
}

/** 생성 요청 본문 검증 (GRP.1.V.* 완화) */
export function parseCreateLineOaGroupBody(raw: unknown):
  | { ok: true; body: { name: string; retention?: string } }
  | { ok: false; message: string; code?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'JSON 본문이 필요합니다.' }
  }
  const o = raw as Record<string, unknown>
  const name = String(o.name ?? '').trim()
  if (!name) return { ok: false, message: "'name'은 필수입니다.", code: 'GRP.1.V.1.1' }
  if (name.length > 100) return { ok: false, message: "'name'은 100자 이하여야 합니다.", code: 'GRP.1.V.1.5' }
  let retention: string | undefined
  if (o.retention != null && o.retention !== '') {
    const r = String(o.retention).trim()
    if (!RETENTION_VALUES.has(r)) {
      return { ok: false, message: "retention은 P90D, P180D, P365D 중 하나여야 합니다.", code: 'GRP.1.V.21.6' }
    }
    retention = r
  }
  return { ok: true, body: retention ? { name, retention } : { name } }
}

export function parsePatchLineOaGroupBody(raw: unknown):
  | { ok: true; body: { name?: string; retention?: string } }
  | { ok: false; message: string; code?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'JSON 본문이 필요합니다.' }
  }
  const o = raw as Record<string, unknown>
  const out: { name?: string; retention?: string } = {}
  if ('name' in o) {
    const name = String(o.name ?? '').trim()
    if (!name) return { ok: false, message: "'name'은 비울 수 없습니다.", code: 'GRP.1.V.1.1' }
    if (name.length > 100) return { ok: false, message: "'name'은 100자 이하여야 합니다.", code: 'GRP.1.V.1.5' }
    out.name = name
  }
  if ('retention' in o && o.retention != null && o.retention !== '') {
    const r = String(o.retention).trim()
    if (!RETENTION_VALUES.has(r)) {
      return { ok: false, message: "retention은 P90D, P180D, P365D 중 하나여야 합니다.", code: 'GRP.1.V.21.6' }
    }
    out.retention = r
  }
  if (Object.keys(out).length === 0) {
    return { ok: false, message: 'name 또는 retention 중 하나 이상을 보내야 합니다.' }
  }
  return { ok: true, body: out }
}

export function parseAssociateLineOaGroupBody(raw: unknown):
  | { ok: true; body: { mode: string; uids: string[] } }
  | { ok: false; message: string; code?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'JSON 본문이 필요합니다.' }
  }
  const o = raw as Record<string, unknown>
  const modeRaw = o.mode != null ? String(o.mode).trim() : ''
  if (modeRaw !== 'append' && modeRaw !== 'overwrite') {
    return { ok: false, message: "mode는 'append' 또는 'overwrite'여야 합니다.", code: 'GRP.1.V.13.6' }
  }
  if (!Array.isArray(o.uids)) {
    return { ok: false, message: "'uids' 배열이 필요합니다.", code: 'GRP.1.V.12.1' }
  }
  const uids = o.uids.map((u) => String(u ?? '').trim()).filter(Boolean)
  if (uids.length < 1) return { ok: false, message: 'uids는 1개 이상이어야 합니다.', code: 'GRP.1.V.12.4' }
  if (uids.length > 10000) return { ok: false, message: 'uids는 최대 10,000개입니다.', code: 'GRP.1.V.12.5' }
  return { ok: true, body: { mode: modeRaw, uids } }
}

export function parseDissociateLineOaGroupBody(raw: unknown):
  | { ok: true; body: { uids: string[] } }
  | { ok: false; message: string; code?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'JSON 본문이 필요합니다.' }
  }
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.uids)) {
    return { ok: false, message: "'uids' 배열이 필요합니다.", code: 'GRP.1.V.12.1' }
  }
  const uids = o.uids.map((u) => String(u ?? '').trim()).filter(Boolean)
  if (uids.length < 1) return { ok: false, message: 'uids는 1개 이상이어야 합니다.', code: 'GRP.1.V.12.4' }
  if (uids.length > 10000) return { ok: false, message: 'uids는 최대 10,000개입니다.', code: 'GRP.1.V.12.5' }
  return { ok: true, body: { uids } }
}
