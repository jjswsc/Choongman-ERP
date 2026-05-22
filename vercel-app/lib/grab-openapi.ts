/**
 * GrabFood Outbound 공통 클라이언트
 * - OAuth 토큰 캐시
 * - 401 1회 재발급 재시도
 * - 429/5xx + 네트워크 오류 백오프 재시도
 */

export type GrabApiEnv = 'staging' | 'production'

const DEFAULT_MAX_ATTEMPTS = 4
const RETRY_BASE_DELAY_MS = 500
const RETRY_MAX_DELAY_MS = 5000
const TOKEN_EXPIRY_SKEW_MS = 60_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

type GrabTokenCache = {
  accessToken: string
  expiresAtMs: number
}

let tokenCache: GrabTokenCache | null = null
let inflightTokenPromise: Promise<string> | null = null

function nowMs(): number {
  return Date.now()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitterMs(max = 250): number {
  return Math.floor(Math.random() * Math.max(1, max))
}

function isHttpRetriable(status: number): boolean {
  return status === 429 || status >= 500
}

function computeRetryDelayMs(attempt: number): number {
  // attempt는 1부터 시작. 1->500ms, 2->1000ms, 3->2000ms, 4->4000ms (+jitter)
  const exp = Math.max(0, attempt - 1)
  const base = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exp)
  return base + jitterMs(250)
}

function resolveRequestTimeoutMs(): number {
  const raw = Number(process.env.GRAB_API_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS)
  if (!Number.isFinite(raw)) return DEFAULT_REQUEST_TIMEOUT_MS
  return Math.min(60_000, Math.max(3_000, Math.floor(raw)))
}

function normalizePath(path: string): string {
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

export function resolveGrabApiEnv(): GrabApiEnv {
  const raw = String(process.env.GRAB_API_ENV || 'staging').trim().toLowerCase()
  if (raw === 'prod' || raw === 'production') return 'production'
  return 'staging'
}

/**
 * Grab partner API base URL (sandbox/prod prefix 포함)
 * - override: GRAB_PARTNER_API_BASE_URL
 */
export function getGrabPartnerApiBaseUrl(env: GrabApiEnv = resolveGrabApiEnv()): string {
  const override = process.env.GRAB_PARTNER_API_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  const root = 'https://partner-api.grab.com'
  return env === 'production' ? `${root}/grabfood` : `${root}/grabfood-sandbox`
}

/**
 * Grab OAuth endpoint (문서상 stg/prod 동일)
 * - override: GRAB_AUTH_BASE_URL
 */
function getGrabAuthUrl(): string {
  const override = process.env.GRAB_AUTH_BASE_URL?.trim()
  if (override) return `${override.replace(/\/$/, '')}/grabid/v1/oauth2/token`
  return 'https://api.grab.com/grabid/v1/oauth2/token'
}

function getRequiredGrabClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GRAB_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GRAB_CLIENT_SECRET?.trim() || ''
  if (!clientId || !clientSecret) {
    throw new Error('Grab OAuth credentials are missing (GRAB_CLIENT_ID / GRAB_CLIENT_SECRET)')
  }
  return { clientId, clientSecret }
}

function isTokenUsable(cache: GrabTokenCache | null): cache is GrabTokenCache {
  if (!cache?.accessToken) return false
  return cache.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > nowMs()
}

type GrabOauthResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
}

async function requestNewGrabAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getRequiredGrabClientCredentials()
  const payload = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'food.partner_api',
  }
  const res = await fetch(getGrabAuthUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const raw = await res.text()
  let json: GrabOauthResponse = {}
  try {
    json = JSON.parse(raw) as GrabOauthResponse
  } catch {
    // non-json 처리
  }

  if (!res.ok || !json.access_token) {
    throw new Error(`Grab OAuth failed: ${res.status} ${raw.slice(0, 300)}`)
  }

  const expiresInSec = Math.max(60, Number(json.expires_in ?? 3600) || 3600)
  tokenCache = {
    accessToken: String(json.access_token),
    expiresAtMs: nowMs() + expiresInSec * 1000,
  }
  return tokenCache.accessToken
}

/**
 * 토큰 조회 (캐시 우선)
 * forceRefresh=true면 캐시 무시하고 재발급
 */
export async function getGrabAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && isTokenUsable(tokenCache)) return tokenCache.accessToken

  if (!forceRefresh && inflightTokenPromise) return inflightTokenPromise

  inflightTokenPromise = requestNewGrabAccessToken().finally(() => {
    inflightTokenPromise = null
  })
  return inflightTokenPromise
}

export type GrabRequestOptions = {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  query?: Record<
    string,
    string | number | boolean | null | undefined | Array<string | number | boolean>
  >
  headers?: Record<string, string>
  body?: unknown
  env?: GrabApiEnv
  maxAttempts?: number
}

function buildUrl(opts: GrabRequestOptions): string {
  const base = getGrabPartnerApiBaseUrl(opts.env)
  const url = new URL(`${base}${normalizePath(opts.path)}`)
  const q = opts.query || {}
  for (const [k, v] of Object.entries(q)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item))
      continue
    }
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

/**
 * 공통 호출 함수: Response 그대로 반환
 */
export async function grabRequest(opts: GrabRequestOptions): Promise<Response> {
  const maxAttempts = Math.max(1, Number(opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS)
  const method = opts.method || 'GET'
  const url = buildUrl(opts)
  const extraHeaders = opts.headers || {}
  const timeoutMs = resolveRequestTimeoutMs()

  let token = await getGrabAccessToken(false)
  let refreshedOn401 = false
  let lastError: unknown = null
  let lastResponse: Response | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    }
    let body: BodyInit | undefined
    if (opts.body !== undefined) {
      const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      if (!hasContentType) headers['Content-Type'] = 'application/json'
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    }

    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(url, { method, headers, body, signal: ctrl.signal }).finally(() => {
        clearTimeout(timeout)
      })
      lastResponse = res

      // 401 -> 토큰 강제 재발급 후 1회 재시도
      if (res.status === 401 && !refreshedOn401) {
        refreshedOn401 = true
        token = await getGrabAccessToken(true)
        continue
      }

      if (isHttpRetriable(res.status) && attempt < maxAttempts) {
        await sleep(computeRetryDelayMs(attempt))
        continue
      }

      return res
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await sleep(computeRetryDelayMs(attempt))
        continue
      }
    }
  }

  if (lastResponse) return lastResponse
  throw new Error(`Grab request failed: ${String(lastError || 'unknown_error')}`)
}

export type GrabJsonRequestOptions = GrabRequestOptions & {
  expectNoContentOk?: boolean
}

/**
 * JSON 응답 래퍼:
 * - 204 응답 시 null 반환
 * - !ok 면 에러 throw (본문 포함)
 */
export async function grabJsonRequest<T = unknown>(opts: GrabJsonRequestOptions): Promise<T | null> {
  const res = await grabRequest(opts)
  if (res.status === 204) return null

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Grab API error: ${res.status} ${raw.slice(0, 500)}`)
  }
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`Grab API non-JSON success response: ${raw.slice(0, 500)}`)
  }
}

/**
 * 테스트/관리용: 메모리 토큰 캐시 초기화
 */
export function clearGrabTokenCacheForTest(): void {
  tokenCache = null
  inflightTokenPromise = null
}

