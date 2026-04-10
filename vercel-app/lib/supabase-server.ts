/**
 * Supabase REST - 서버 전용 (Next.js API routes)
 *
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(권장) 또는 SUPABASE_ANON_KEY 환경 변수 필요.
 * service_role은 RLS를 우회하여 안전한 서버 전용 접근. anon은 RLS 적용됨.
 * API 라우트(app/api/*) 내부에서만 import. 클라이언트 번들에 포함되지 않도록.
 *
 * UND_ERR_HEADERS_TIMEOUT 방지: Node.js fetch(undici) 대신 https 모듈 사용.
 * 일시적 장애 대응: 5xx/429/네트워크 오류 시 최대 2회 재시도 (exponential backoff).
 */

import https from 'node:https'
import { resolveSupabaseProjectConfig } from '@/lib/supabase-project-resolver'
import type { TenantContext } from '@/lib/tenant-context'

const SUPABASE_RETRY_MAX = 3
const SUPABASE_RETRY_BASE_MS = 800

/** 디버그용 — 매 Supabase 요청마다 디스크 쓰기하면 로컬·다건 조회 시 병목·타임아웃 유발 */
const _log = (msg: string, data?: Record<string, unknown>) => {
  void msg
  void data
}

function httpsRequest(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string | Buffer }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    // #region agent log
    _log('httpsRequest start', { hostname: url.hostname, path: url.pathname.slice(0, 80), hypothesisId: 'H2' })
    // #endregion
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers,
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (ch) => chunks.push(ch))
        res.on('end', () => {
          // #region agent log
          _log('httpsRequest success', { status: res.statusCode, hypothesisId: 'H2' })
          // #endregion
          const headers: Record<string, string> = {}
          Object.entries(res.headers).forEach(([k, v]) => {
            headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '')
          })
          resolve({
            status: res.statusCode || 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      }
    )
    req.on('error', (e) => {
      // #region agent log
      _log('httpsRequest error', { message: String(e), code: (e as NodeJS.ErrnoException).code, hypothesisId: 'H2' })
      // #endregion
      reject(e)
    })
    req.on('timeout', () => {
      // #region agent log
      _log('httpsRequest timeout', { hypothesisId: 'H2' })
      // #endregion
      req.destroy()
      reject(new Error('Supabase request timeout'))
    })
    if (options.body) req.write(options.body)
    req.end()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 5xx, 429, 네트워크 오류 시 재시도 대상 */
function isRetriable(status: number | null, err: unknown): boolean {
  if (status != null) return status >= 500 || status === 429
  const msg = err instanceof Error ? err.message : String(err)
  return /timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|failed/i.test(msg)
}

export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof Request
        ? input.url
        : input.toString()
  const reqInit = input instanceof Request ? input : init
  const method = (reqInit?.method as string) || 'GET'
  const headers: Record<string, string> = {}
  const headersSource = input instanceof Request ? input.headers : reqInit?.headers
  if (headersSource) {
    const h = headersSource as Headers
    if (h.forEach) {
      h.forEach((v, k) => { headers[k] = v })
    } else if (typeof h === 'object') {
      Object.entries(h as unknown as Record<string, string>).forEach(([k, v]) => { headers[k] = String(v) })
    }
  }
  const bodyRaw = input instanceof Request ? input.body : reqInit?.body
  let body: string | Buffer | undefined
  if (bodyRaw) {
    if (typeof bodyRaw === 'string') body = bodyRaw
    else if (bodyRaw instanceof ArrayBuffer || ArrayBuffer.isView(bodyRaw))
      body = Buffer.from(bodyRaw as ArrayBuffer)
    else if (typeof (bodyRaw as Blob).arrayBuffer === 'function')
      body = Buffer.from(await (bodyRaw as Blob).arrayBuffer())
    else body = Buffer.from(bodyRaw as unknown as ArrayBuffer)
  }

  let lastStatus: number | null = null
  let lastErr: unknown = null
  let resHeaders: Record<string, string> = {}
  let resBody = ''

  for (let attempt = 1; attempt <= SUPABASE_RETRY_MAX; attempt++) {
    try {
      const res = await httpsRequest(urlStr, { method, headers, body })
      lastStatus = res.status
      resHeaders = res.headers
      resBody = res.body
      if (!isRetriable(res.status, null)) {
        const resHeadersObj = new Headers()
        Object.entries(resHeaders).forEach(([k, v]) => resHeadersObj.set(k, v))
        const nullBodyStatuses = [101, 204, 205, 304]
        const bodyForResponse = nullBodyStatuses.includes(res.status) ? null : resBody
        return new Response(bodyForResponse, { status: res.status, headers: resHeadersObj })
      }
      lastErr = new Error(`Supabase ${res.status}`)
    } catch (e) {
      lastErr = e
      lastStatus = null
    }
    if (attempt < SUPABASE_RETRY_MAX) {
      const delay = SUPABASE_RETRY_BASE_MS * Math.pow(2, attempt - 1)
      await sleep(delay)
    }
  }

  if (lastStatus != null) {
    const resHeadersObj = new Headers()
    Object.entries(resHeaders).forEach(([k, v]) => resHeadersObj.set(k, v))
    return new Response(lastStatus >= 500 ? resBody : null, { status: lastStatus, headers: resHeadersObj })
  }
  throw lastErr
}

let warnedMissingServiceRole = false

function getConfig(scope?: TenantContext) {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()
  const key = serviceKey || anonKey
  if (!key || !process.env.SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(권장) 또는 SUPABASE_ANON_KEY가 필요합니다. ' +
        '보안을 위해 service_role 키 사용을 권장합니다.'
    )
  }
  const resolved = resolveSupabaseProjectConfig(scope?.tenantId)
  if (!serviceKey && anonKey && !warnedMissingServiceRole) {
    warnedMissingServiceRole = true
    console.warn(
      '[supabase-server] SUPABASE_SERVICE_ROLE_KEY가 없어 anon 키로 PostgREST를 호출합니다. ' +
        'RLS가 켜진 테이블(sauces, sauce_ingredients 등)은 0건·거부로 보일 수 있습니다. 서버(Vercel)에 service_role 키를 설정하세요.'
    )
  }
  return { url: resolved.url, key: resolved.key, projectId: resolved.projectId }
}

export type TenantScopedFilterOptions = {
  tenantId?: string
  company?: string
  tenantColumn?: string
  companyColumn?: string
}

/**
 * 테넌트 경계가 필요한 API에서 필터를 만들 때 사용.
 * 현재 스키마 전환기라 tenant_id 또는 company 컬럼을 선택적으로 함께 지원한다.
 */
export function buildTenantFilter(options: TenantScopedFilterOptions): string {
  const tenantColumn = options.tenantColumn || 'tenant_id'
  const companyColumn = options.companyColumn || 'company'
  const tenantId = String(options.tenantId || '').trim()
  const company = String(options.company || '').trim()
  if (tenantId) return `${tenantColumn}=eq.${encodeURIComponent(tenantId)}`
  if (company) return `${companyColumn}=eq.${encodeURIComponent(company)}`
  return ''
}

export function appendTenantFilter(baseFilter: string, options: TenantScopedFilterOptions): string {
  const tenantFilter = buildTenantFilter(options)
  if (!tenantFilter) return baseFilter
  if (!baseFilter) return tenantFilter
  return `${baseFilter}&${tenantFilter}`
}

/**
 * PostgREST 한 요청당 가져올 행 상한(기본값). Supabase Dashboard → Settings → API 의 max rows 와 맞추거나 env로 상향.
 * 예: SUPABASE_SELECT_PAGE_SIZE_MAX=20000
 */
export function supabaseSelectPageCap(): number {
  const raw = Number(process.env.SUPABASE_SELECT_PAGE_SIZE_MAX || '10000')
  if (!Number.isFinite(raw) || raw < 1) return 10000
  return Math.min(Math.floor(raw), 500_000)
}

/** 전 페이지 조회 루프 상한 (한 테이블당 최대 페이지 수) */
export const SUPABASE_SELECT_ALL_PAGES_MAX_PAGES = 5000
/** supabaseSelectAllPages 기본 maxRows (옵션 미지정 시) */
export const SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS = 1_000_000
export const SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_PAGES = 5000
export const SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_ROWS_CEILING = 5_000_000
export const SUPABASE_SELECT_FILTER_ALL_PAGES_MIN_STRIDE = 500

/** 관리자 설정 화면용 — Vercel에 적용된 조회 상한(비밀값 없음) */
export function getSupabaseDataLimitDiagnostics() {
  const rawEnv = (process.env.SUPABASE_SELECT_PAGE_SIZE_MAX || '').trim()
  return {
    selectPageCap: supabaseSelectPageCap(),
    envSupabaseSelectPageSizeMax: rawEnv || null,
    selectAllPagesMaxPages: SUPABASE_SELECT_ALL_PAGES_MAX_PAGES,
    selectAllPagesDefaultMaxRows: SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS,
    selectFilterAllPagesMaxPages: SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_PAGES,
    selectFilterAllPagesMaxRowsCeiling: SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_ROWS_CEILING,
    selectFilterAllPagesMinStride: SUPABASE_SELECT_FILTER_ALL_PAGES_MIN_STRIDE,
    fetchedAt: new Date().toISOString(),
  }
}

export async function supabaseSelect(
  table: string,
  options: { order?: string; limit?: number; offset?: number; select?: string } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = [options.select ? `select=${encodeURIComponent(options.select)}` : 'select=*']
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
  const cap = supabaseSelectPageCap()
  const limit =
    options.limit != null ? Math.max(1, Math.min(Number(options.limit), cap)) : cap
  const offset = options.offset != null ? Math.max(0, Number(options.offset)) : 0
  query.push(`limit=${limit}`)
  if (offset > 0) query.push(`offset=${offset}`)
  const rangeStart = offset
  const rangeEnd = offset + limit - 1
  const res = await supabaseFetch(pathStr + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Range: `${rangeStart}-${Math.max(rangeStart, rangeEnd)}`,
    },
  })
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()))
  return res.json()
}

/**
 * PostgREST 단일 limit을 넘는 테이블 전체 로드 (offset 페이지 반복).
 * 원가 분석 등 메뉴·재료·품목 전량이 필요할 때 사용.
 */
export async function supabaseSelectAllPages(
  table: string,
  options: { order: string; select: string; pageSize?: number; maxRows?: number }
): Promise<unknown[]> {
  const cap = supabaseSelectPageCap()
  const pageSize = Math.max(1, Math.min(options.pageSize ?? cap, cap))
  const maxRows = options.maxRows ?? SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS
  const out: unknown[] = []
  let offset = 0
  /** PostgREST/프록시가 limit=10000 요청에도 예: 1000행만 줄 수 있음. rows.length < pageSize 로 끊으면 나머지 페이지를 영원히 안 읽음 → 원가 분석 등에서 최신 BOM 누락 */
  let guard = 0
  const maxPages = SUPABASE_SELECT_ALL_PAGES_MAX_PAGES
  while (out.length < maxRows && guard++ < maxPages) {
    const batch = await supabaseSelect(table, {
      order: options.order,
      limit: pageSize,
      offset,
      select: options.select,
    })
    const rows = Array.isArray(batch) ? batch : []
    if (rows.length === 0) break
    out.push(...rows)
    if (out.length >= maxRows) break
    offset += rows.length
  }
  return out
}

export async function supabaseInsert(table: string, row: Record<string, unknown>) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const res = await supabaseFetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error('Supabase insert failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}

/**
 * PostgREST upsert — on_conflict 열이 이미 있으면 본문 필드로 병합(갱신).
 * pos_printer_settings(store_code PK) 저장 등 INSERT/UPDATE 분기 실패를 막기 위해 사용.
 */
export async function supabaseUpsertMerge(
  table: string,
  onConflictColumn: string,
  row: Record<string, unknown>
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflictColumn)}`
  const res = await supabaseFetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error('Supabase upsert failed: ' + (await res.text()))
}

export async function supabaseUpdate(
  table: string,
  id: string | number,
  patch: Record<string, unknown>
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(String(id))}`
  const res = await supabaseFetch(pathStr, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Supabase update failed: ' + (await res.text()))
  return true
}
export async function supabaseSelectFilter(
  table: string,
  filter: string,
  options: { order?: string; limit?: number; select?: string } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = [options.select ? `select=${encodeURIComponent(options.select)}` : 'select=*', filter]
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
  const cap = supabaseSelectPageCap()
  const limit =
    options.limit != null ? Math.max(1, Math.min(Number(options.limit), cap)) : cap
  query.push(`limit=${limit}`)
  const rangeEnd = limit - 1
  const res = await supabaseFetch(pathStr + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Range: `0-${Math.max(0, rangeEnd)}`,
    },
  })
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()))
  return res.json()
}

/**
 * PostgREST Range 헤더로 구간 조회 (URL의 limit와 중복 쓰지 않음)
 */
export async function supabaseSelectFilterRange(
  table: string,
  filter: string,
  options: { order?: string; select?: string; rangeStart: number; rangeEnd: number }
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = [options.select ? `select=${encodeURIComponent(options.select)}` : 'select=*', filter]
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
  const rs = Math.max(0, Math.floor(options.rangeStart))
  const re = Math.max(rs, Math.floor(options.rangeEnd))
  const res = await supabaseFetch(pathStr + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Range: `${rs}-${re}`,
    },
  })
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()))
  return res.json()
}

/**
 * 필터에 맞는 행을 Range 페이지로 반복 조회해 전부 수집 (상한 도달·빈 페이지에서 중단)
 * schedules 등 행 수가 계속 늘어나도 한 번의 고정 limit에 잘리지 않게 할 때 사용
 */
export async function supabaseSelectFilterAllPages(
  table: string,
  filter: string,
  options: { order?: string; select?: string; pageSize?: number; maxRows?: number } = {}
): Promise<unknown[]> {
  const cap = supabaseSelectPageCap()
  const pageSize = Math.max(
    SUPABASE_SELECT_FILTER_ALL_PAGES_MIN_STRIDE,
    Math.min(Number(options.pageSize) || Math.min(8000, cap), cap)
  )
  const maxRows = Math.min(
    Math.max(pageSize, Number(options.maxRows) || 2_000_000),
    SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_ROWS_CEILING
  )
  const all: unknown[] = []
  let start = 0
  let guard = 0
  const maxPages = SUPABASE_SELECT_FILTER_ALL_PAGES_MAX_PAGES
  while (all.length < maxRows && guard++ < maxPages) {
    const end = start + pageSize - 1
    const batch = (await supabaseSelectFilterRange(table, filter, {
      order: options.order,
      select: options.select,
      rangeStart: start,
      rangeEnd: end,
    })) as unknown[]
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (all.length >= maxRows) break
    start += batch.length
  }
  return all
}

export async function supabaseUpdateByFilter(
  table: string,
  filter: string,
  patch: Record<string, unknown>
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?${filter}`
  const res = await supabaseFetch(pathStr, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Supabase update by filter failed: ' + (await res.text()))
  return true
}

export async function supabaseDeleteByFilter(
  table: string,
  filter: string
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?${filter}`
  const res = await supabaseFetch(pathStr, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) throw new Error('Supabase delete failed: ' + (await res.text()))
  return true
}

/**
 * count만 필요할 때 사용. PostgREST Prefer: count=exact + Range: 0-0 으로
 * 실제 row는 거의 가져오지 않고 Content-Range 헤더에서 total count 반환.
 * egress 최소화용.
 */
export async function supabaseCountFilter(table: string, filter: string): Promise<number> {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?select=id&${filter}`
  const res = await supabaseFetch(pathStr, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!res.ok) throw new Error('Supabase count failed: ' + (await res.text()))
  const range = res.headers.get('Content-Range')
  if (range) {
    const match = range.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/** 테이블 전체 행 수 (필터 없음). RLS/권한에 따라 관리 API에서만 사용 권장. */
export async function supabaseCountTable(table: string): Promise<number> {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?select=id`
  const res = await supabaseFetch(pathStr, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!res.ok) throw new Error('Supabase count failed: ' + (await res.text()))
  const range = res.headers.get('Content-Range')
  if (range) {
    const match = range.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

/** RPC 호출. params는 함수 인자 (예: { p_location_patterns: ['a','b'], p_as_of_date: null }) */
export async function supabaseRpc<T = unknown>(
  fnName: string,
  params: Record<string, unknown>
): Promise<T> {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/rpc/${encodeURIComponent(fnName)}`
  const res = await supabaseFetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Supabase RPC failed: ' + (await res.text()))
  const text = await res.text()
  return (text ? JSON.parse(text) : []) as T
}

export async function supabaseInsertMany(table: string, rows: Record<string, unknown>[]) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const res = await supabaseFetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error('Supabase insert many failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}

/**
 * Storage: 파일 업로드
 * path 예: "projectId/filename.pdf"
 * @returns object path (bucket/objectPath)
 */
/** 공개 버킷 객체 URL (경로에 / 포함 가능, 세그먼트별 인코딩) */
export function supabaseStoragePublicUrl(bucket: string, objectPath: string): string {
  const { url } = getConfig()
  const base = url.replace(/\/$/, '')
  const encoded = objectPath
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`
}

/**
 * Storage: 버킷 생성 (service_role). 이미 있으면 성공으로 간주.
 * presign 전에 버킷 누락을 자동 복구할 때 사용.
 */
export async function supabaseStorageCreateBucketIfNeeded(
  bucketName: string,
  options: {
    public: boolean
    file_size_limit?: number
    allowed_mime_types?: string[] | null
  }
): Promise<void> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const body: Record<string, unknown> = {
    name: bucketName,
    public: options.public,
  }
  if (options.file_size_limit != null) body.file_size_limit = options.file_size_limit
  if (options.allowed_mime_types != null) body.allowed_mime_types = options.allowed_mime_types

  const res = await supabaseFetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (res.ok) return
  if (
    res.status === 409 ||
    res.status === 422 ||
    /already exists|Duplicate|duplicate bucket/i.test(text)
  ) {
    return
  }
  throw new Error(`Supabase create bucket failed (${res.status}): ${text}`)
}

/**
 * Storage: 클라이언트 직접 업로드용 signed upload URL 발급 (POST /object/upload/sign/…)
 * 업로드 본문은 Vercel을 거치지 않음 → Incoming 절감.
 */
export async function supabaseCreateSignedUploadUrl(
  bucket: string,
  objectPath: string,
  options?: { upsert?: boolean }
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const storageV1 = `${base}/storage/v1`
  const segments = [bucket, ...objectPath.split('/').filter(Boolean)].map((s) => encodeURIComponent(s))
  const apiPath = `${storageV1}/object/upload/sign/${segments.join('/')}`

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (options?.upsert) headers['x-upsert'] = 'true'

  const res = await supabaseFetch(apiPath, {
    method: 'POST',
    headers,
    body: '{}',
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error('Supabase createSignedUploadUrl failed: ' + text)
  }
  let parsed: { url?: string }
  try {
    parsed = JSON.parse(text) as { url?: string }
  } catch {
    throw new Error('Supabase createSignedUploadUrl: invalid JSON')
  }
  const relative = parsed.url
  if (!relative || typeof relative !== 'string') {
    throw new Error('Supabase createSignedUploadUrl: missing url in response')
  }
  const signedFull = relative.startsWith('http')
    ? relative
    : `${storageV1}${relative.startsWith('/') ? '' : '/'}${relative}`
  const u = new URL(signedFull)
  const token = u.searchParams.get('token')
  if (!token) {
    throw new Error('Supabase createSignedUploadUrl: no token in URL')
  }
  return { signedUrl: signedFull, token, path: objectPath }
}

export async function supabaseStorageUpload(
  bucket: string,
  path: string,
  body: Blob | ArrayBuffer,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ key: string; publicUrl: string }> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map((p) => encodeURIComponent(p)).join('/')}`

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': options?.contentType || 'application/octet-stream',
  }
  if (options?.upsert) {
    headers['x-upsert'] = 'true'
  }

  const res = await supabaseFetch(apiPath, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error('Supabase storage upload failed: ' + text)
  }
  const json = (await res.json()) as { Key?: string }
  const objectKey = json.Key || `${bucket}/${path}`
  const publicUrl = `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`
  return { key: objectKey, publicUrl }
}

/**
 * Storage: 객체 삭제
 * path 예: "projectId/filename.pdf"
 */
export async function supabaseStorageDelete(bucket: string, path: string): Promise<void> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map((p) => encodeURIComponent(p)).join('/')}`

  const res = await supabaseFetch(apiPath, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error('Supabase storage delete failed: ' + text)
  }
}

/** UPSERT: 충돌 시 기존 행 갱신. onConflict 예: "month,store,name" */
export async function supabaseUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`
  const res = await supabaseFetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error('Supabase upsert failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}
