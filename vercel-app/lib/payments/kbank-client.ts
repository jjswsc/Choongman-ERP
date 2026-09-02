import type {
  KbankCancelQrRequest,
  KbankCancelQrResult,
  KbankCheckStatusRequest,
  KbankCheckStatusResult,
  KbankGenerateQrRequest,
  KbankGenerateQrResult,
  KbankSettlementRequest,
  KbankSettlementResult,
  KbankTokenResponse,
  KbankVoidPaymentRequest,
  KbankVoidPaymentResult,
} from '@/lib/payments/kbank-types'
import { getBangkokRequestDtIso } from '@/lib/bangkok-time'
import {
  formatKbankApiErrorMessage,
  formatKbankHttpErrorMessage,
  isKbankAccessTokenAuthError,
  isKbankAccessTokenExpiredError,
  isKbankBusinessSuccess,
  isKbankFetchAbortError,
  isKbankRateLimitError,
  KBANK_TOKEN_EXPIRY_SKEW_MS,
  maskKbankMessageForLog,
  readKbankResponseStatusCode,
  resolveKbankInquiryTxnNoForRequest,
  resolveKbankQrTypeCode,
  resolveKbankVoidTxnNoForRequest,
  stripDisallowedKbankActionPayloadFields,
} from '@/lib/payments/kbank-api-reference'
import type { KbankRuntimeEnv } from '@/lib/payments/kbank-runtime-env'
import { kbankRuntimeField, mustKbankRuntimeField } from '@/lib/payments/kbank-runtime-env'
import {
  clearSharedKbankAccessToken,
  readSharedKbankAccessToken,
  releaseKbankTokenLock,
  tryAcquireKbankTokenLock,
  waitForSharedKbankAccessToken,
  writeSharedKbankAccessToken,
} from '@/lib/payments/kbank-shared-token'
import {
  logKbankTokenMetric,
  maskKbankPartnerTxnUid,
} from '@/lib/payments/kbank-token-metrics'

export type { KbankRuntimeEnv } from '@/lib/payments/kbank-runtime-env'

export type KbankClientOpts = {
  timeoutMs?: number
  runtime?: KbankRuntimeEnv
}

const KBANK_DEFAULT_TIMEOUT_MS = 12_000
/** QR generate: Vercel → Lightsail proxy → KBank. 12s aborted slow bank/proxy replies. */
const KBANK_QR_GENERATE_TIMEOUT_MS = 20_000

type KbankCtx = { runtime?: KbankRuntimeEnv }

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function mustEnvCtx(ctx: KbankCtx, name: string): string {
  return mustKbankRuntimeField(ctx.runtime, name)
}

function stripTrailingSlash(v: string): string {
  return v.replace(/\/+$/, '')
}

function normalizePath(v: string): string {
  if (!v) return ''
  return v.startsWith('/') ? v : `/${v}`
}

function buildUrl(ctx: KbankCtx, pathEnvName: string, defaultPath: string): string {
  const base = stripTrailingSlash(mustEnvCtx(ctx, 'KBANK_OPENAPI_BASE_URL'))
  const p = normalizePath(kbankRuntimeField(ctx.runtime, pathEnvName) || defaultPath)
  return `${base}${p}`
}

function buildTokenUrl(ctx: KbankCtx, defaultPath: string): string {
  const tokenBase = kbankRuntimeField(ctx.runtime, 'KBANK_OAUTH_BASE_URL')
  const base = stripTrailingSlash(tokenBase || mustEnvCtx(ctx, 'KBANK_OPENAPI_BASE_URL'))
  const p = normalizePath(kbankRuntimeField(ctx.runtime, 'KBANK_TOKEN_PATH') || defaultPath)
  return `${base}${p}`
}

function getProxySecret(ctx: KbankCtx): string {
  return kbankRuntimeField(ctx.runtime, 'KBANK_PROXY_SECRET')
}

function isLikelyProxyUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    return !(host.includes('kasikornbank.com') || host.includes('kbank.com'))
  } catch {
    return false
  }
}

function withProxySecret(ctx: KbankCtx, headers: Record<string, string>, _urlStr: string): Record<string, string> {
  const proxySecret = getProxySecret(ctx)
  if (proxySecret) {
    return {
      ...headers,
      'X-Proxy-Secret': proxySecret,
    }
  }
  return headers
}

function buildProxyHint(ctx: KbankCtx, urlStr: string, status: number): string {
  if (status !== 403 || !isLikelyProxyUrl(urlStr)) return ''
  if (!getProxySecret(ctx)) {
    return ' (Proxy detected but KBANK_PROXY_SECRET is not set.)'
  }
  return ' (Proxy secret mismatch or proxy access policy denied.)'
}

function pickFirstNonEmpty(values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function extractKbankErrorMessage(
  json: Record<string, unknown>,
  fallback: string,
  httpStatus?: number
): string {
  const errorObj =
    json.error && typeof json.error === 'object' && !Array.isArray(json.error)
      ? (json.error as Record<string, unknown>)
      : null
  const firstError =
    Array.isArray(json.errors) && json.errors[0] && typeof json.errors[0] === 'object'
      ? (json.errors[0] as Record<string, unknown>)
      : null
  const errorCode = pickFirstNonEmpty([
    json.errorCode,
    errorObj?.errorCode,
    firstError?.errorCode,
  ])
  const errorDesc = pickFirstNonEmpty([
    json.errorDesc,
    json.error_description,
    errorObj?.errorDesc,
    firstError?.errorDesc,
  ])
  const msg = pickFirstNonEmpty([
    json.statusMessage,
    json.message,
    json.detail,
    errorObj?.statusMessage,
    errorObj?.message,
    errorObj?.detail,
    errorObj?.description,
    firstError?.message,
    firstError?.detail,
  ])
  const openApiCode = String(json.code || '').trim().toLowerCase()
  if (openApiCode === 'openapi_error' || (httpStatus != null && httpStatus >= 400)) {
    const httpMsg = formatKbankHttpErrorMessage(httpStatus ?? 0, json, msg || fallback)
    if (httpMsg) return httpMsg
  }
  return formatKbankApiErrorMessage(errorCode, errorDesc, msg || fallback)
}

function shouldRetryKbankAuth(httpStatus: number, json: Record<string, unknown>): boolean {
  if (httpStatus !== 401) return false
  const message = String(json.message || json.statusMessage || '').trim()
  return isKbankAccessTokenExpiredError(message) || isKbankAccessTokenAuthError(message)
}

function normalizePartnerTxnUid(seed: string | undefined, fallbackPrefix: string): string {
  const clean = String(seed || '').trim()
  if (clean) return clean.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  return `${fallbackPrefix}${Date.now()}`
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs))
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(timer),
  }
}

function kbankTimeoutMessage(api: string, timeoutMs: number): string {
  const sec = Math.max(1, Math.round(timeoutMs / 1000))
  return `KBank ${api} timed out after ${sec}s. Check proxy/bank and retry.`
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const { signal, clear } = timeoutSignal(timeoutMs)
  try {
    return await fetch(url, { ...init, cache: init.cache ?? 'no-store', signal })
  } finally {
    clear()
  }
}

type CachedKbankToken = {
  token: KbankTokenResponse
  expiresAtMs: number
}

/** L1 only — shared Supabase cache is the source of truth across instances. */
const cachedKbankTokens = new Map<string, CachedKbankToken>()
const inFlightKbankTokenPromises = new Map<string, Promise<KbankTokenResponse>>()

function tokenCacheKey(ctx: KbankCtx): string {
  return ctx.runtime?.cacheKey || 'env-default'
}

function setLocalKbankTokenCache(key: string, token: KbankTokenResponse, expiresAtMs: number): void {
  cachedKbankTokens.set(key, { token, expiresAtMs })
}

export function clearKbankAccessTokenCache(cacheKey?: string): void {
  if (cacheKey) {
    cachedKbankTokens.delete(cacheKey)
    inFlightKbankTokenPromises.delete(cacheKey)
    void clearSharedKbankAccessToken(cacheKey)
    return
  }
  cachedKbankTokens.clear()
  inFlightKbankTokenPromises.clear()
}

/** Await shared clear when forcing refresh after 401 (best-effort). */
export async function clearKbankAccessTokenCacheAsync(cacheKey?: string): Promise<void> {
  if (cacheKey) {
    cachedKbankTokens.delete(cacheKey)
    inFlightKbankTokenPromises.delete(cacheKey)
    await clearSharedKbankAccessToken(cacheKey)
    return
  }
  cachedKbankTokens.clear()
  inFlightKbankTokenPromises.clear()
}

function isUsableCachedToken(entry: CachedKbankToken | undefined, nowMs: number): boolean {
  if (!entry) return false
  const token = String(entry.token.access_token || '').trim()
  if (!token) return false
  return entry.expiresAtMs > nowMs
}

export type FetchKbankAccessTokenOpts = Pick<KbankClientOpts, 'runtime'> & {
  /** Skip caches and request a new token (after 401). Uses distributed lock. */
  forceRefresh?: boolean
  /** Metric reason — never include secrets. */
  reason?: string
}

async function requestKbankAccessTokenFromBank(
  ctx: KbankCtx,
  timeoutMs: number,
  reason: string
): Promise<{ token: KbankTokenResponse; expiresAtMs: number }> {
  const consumerId = mustEnvCtx(ctx, 'KBANK_CONSUMER_ID')
  const consumerSecret = mustEnvCtx(ctx, 'KBANK_CONSUMER_SECRET')
  const tokenUrl = buildTokenUrl(ctx, '/v2/oauth/token')
  const scope = kbankRuntimeField(ctx.runtime, 'KBANK_TOKEN_SCOPE')
  const key = tokenCacheKey(ctx)

  const form = new URLSearchParams()
  form.set('grant_type', 'client_credentials')
  if (scope) form.set('scope', scope)

  const basic = Buffer.from(`${consumerId}:${consumerSecret}`).toString('base64')
  logKbankTokenMetric({
    event: 'token_endpoint_request',
    cacheKey: key,
    reason,
    api: 'oauth_token',
  })
  try {
    const res = await fetchWithTimeout(
      tokenUrl,
      {
        method: 'POST',
        headers: withProxySecret(
          ctx,
          {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          tokenUrl
        ),
        body: form.toString(),
      },
      timeoutMs
    )
    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        const errJson = text ? (JSON.parse(text) as Record<string, unknown>) : {}
        detail = extractKbankErrorMessage(errJson, detail, res.status)
      } catch {
        /* keep raw */
      }
      const message = `${detail}${buildProxyHint(ctx, tokenUrl, res.status)}`
      logKbankTokenMetric({
        event: 'token_endpoint_error',
        cacheKey: key,
        reason,
        httpStatus: res.status,
        detail: message.slice(0, 180),
      })
      if (res.status === 429 || isKbankRateLimitError(message)) {
        logKbankTokenMetric({
          event: 'kbank_api_429_no_retry',
          cacheKey: key,
          reason: 'token_endpoint',
          httpStatus: 429,
          api: 'oauth_token',
        })
      }
      throw new Error(message)
    }
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('KBank token response is not valid JSON.')
    }
    const accessToken = String(json.access_token || '').trim()
    if (!accessToken) {
      throw new Error(`KBank token response missing access_token: ${text.slice(0, 300)}`)
    }
    const tokenStatus = String(json.status || '').trim().toLowerCase()
    if (tokenStatus && tokenStatus !== 'approved') {
      throw new Error(`KBank token status not approved (status=${tokenStatus}): ${text.slice(0, 300)}`)
    }
    const expiresInSec = Number(json.expires_in || 0) || 0
    const token: KbankTokenResponse = {
      access_token: accessToken,
      token_type: String(json.token_type || '').trim() || undefined,
      expires_in: expiresInSec || undefined,
      scope: String(json.scope || '').trim() || undefined,
    }
    const ttlMs = Math.max(60_000, (expiresInSec > 0 ? expiresInSec : 300) * 1000)
    const safeExpiresAtMs = Date.now() + ttlMs - KBANK_TOKEN_EXPIRY_SKEW_MS
    logKbankTokenMetric({
      event: 'token_endpoint_ok',
      cacheKey: key,
      reason,
      api: 'oauth_token',
    })
    return { token, expiresAtMs: safeExpiresAtMs }
  } catch (err) {
    if (isKbankFetchAbortError(err)) {
      logKbankTokenMetric({
        event: 'kbank_api_timeout',
        cacheKey: key,
        reason,
        api: 'oauth_token',
        detail: `${timeoutMs}ms`,
      })
      throw new Error(kbankTimeoutMessage('OAuth token', timeoutMs))
    }
    const raw = err instanceof Error ? err.message : String(err)
    const lower = raw.toLowerCase()
    if (
      lower === 'fetch failed' ||
      lower.includes('connect timeout') ||
      lower.includes('und_err_connect') ||
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('network')
    ) {
      logKbankTokenMetric({
        event: 'token_endpoint_error',
        cacheKey: key,
        reason: 'proxy_unreachable',
        detail: raw.slice(0, 180),
        api: 'oauth_token',
      })
      throw new Error(
        `KBank proxy unreachable (${tokenUrl}). Check Lightsail/nginx kbank-proxy. Detail: ${raw.slice(0, 120)}`
      )
    }
    throw err instanceof Error ? err : new Error(raw)
  }
}

export async function fetchKbankAccessToken(
  timeoutMs = KBANK_DEFAULT_TIMEOUT_MS,
  opts?: FetchKbankAccessTokenOpts
): Promise<KbankTokenResponse> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  const key = tokenCacheKey(ctx)
  const reason = String(opts?.reason || (opts?.forceRefresh ? 'force_refresh' : 'reuse')).trim()
  const nowMs = Date.now()

  if (!opts?.forceRefresh) {
    const local = cachedKbankTokens.get(key)
    if (isUsableCachedToken(local, nowMs)) {
      logKbankTokenMetric({ event: 'token_cache_hit', cacheKey: key, reason: 'l1_memory' })
      return local!.token
    }
    const shared = await readSharedKbankAccessToken(key)
    if (shared) {
      setLocalKbankTokenCache(key, shared.token, shared.expiresAtMs)
      return shared.token
    }
  } else {
    await clearKbankAccessTokenCacheAsync(key)
  }

  const inflight = inFlightKbankTokenPromises.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    const lockHolder = await tryAcquireKbankTokenLock(key, 20)
    if (!lockHolder) {
      const waited = await waitForSharedKbankAccessToken(key, Math.min(timeoutMs, KBANK_DEFAULT_TIMEOUT_MS))
      if (waited) {
        setLocalKbankTokenCache(key, waited.token, waited.expiresAtMs)
        return waited.token
      }
      // Last resort: another instance may have failed — try lock once more then fetch.
      const retryHolder = await tryAcquireKbankTokenLock(key, 20)
      if (!retryHolder) {
        throw new Error('KBank token refresh lock busy. Retry shortly.')
      }
      try {
        const sharedAgain = await readSharedKbankAccessToken(key)
        if (sharedAgain && !opts?.forceRefresh) {
          setLocalKbankTokenCache(key, sharedAgain.token, sharedAgain.expiresAtMs)
          return sharedAgain.token
        }
        const fetched = await requestKbankAccessTokenFromBank(ctx, timeoutMs, reason || 'lock_retry')
        setLocalKbankTokenCache(key, fetched.token, fetched.expiresAtMs)
        await writeSharedKbankAccessToken(key, fetched.token, fetched.expiresAtMs)
        return fetched.token
      } finally {
        await releaseKbankTokenLock(key, retryHolder)
      }
    }

    try {
      if (!opts?.forceRefresh) {
        const sharedAfterLock = await readSharedKbankAccessToken(key)
        if (sharedAfterLock) {
          setLocalKbankTokenCache(key, sharedAfterLock.token, sharedAfterLock.expiresAtMs)
          return sharedAfterLock.token
        }
      }
      const fetched = await requestKbankAccessTokenFromBank(ctx, timeoutMs, reason || 'miss')
      setLocalKbankTokenCache(key, fetched.token, fetched.expiresAtMs)
      await writeSharedKbankAccessToken(key, fetched.token, fetched.expiresAtMs)
      return fetched.token
    } finally {
      await releaseKbankTokenLock(key, lockHolder)
    }
  })()

  inFlightKbankTokenPromises.set(key, promise)
  try {
    return await promise
  } finally {
    inFlightKbankTokenPromises.delete(key)
  }
}

function buildQrPayload(ctx: KbankCtx, req: KbankGenerateQrRequest): Record<string, unknown> {
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) } as Record<string, unknown>
  const partnerTxnUid = String(req.partnerTransactionId || '')
    .trim()
    .slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const reference1 = String(req.reference1 || '').trim() || partnerTxnUid
  const terminalId = String(
    payload.terminalId || kbankRuntimeField(ctx.runtime, 'KBANK_TERMINAL_ID') || ''
  ).trim()
  const qrType = resolveKbankQrTypeCode(req.qrType)
  const txnAmount = Number(req.amount || 0).toFixed(2)

  return {
    ...payload,
    partnerTxnUid,
    partnerId,
    partnerSecret,
    requestDt: String(payload.requestDt || getBangkokRequestDtIso()),
    merchantId,
    ...(terminalId ? { terminalId } : {}),
    qrType,
    txnAmount,
    txnCurrencyCode: String(payload.txnCurrencyCode || 'THB'),
    reference1,
    reference2: req.reference2 || null,
    reference3: req.reference3 || null,
    reference4: req.reference4 || null,
  }
}

export async function generateKbankQr(
  req: KbankGenerateQrRequest,
  opts?: KbankClientOpts
): Promise<KbankGenerateQrResult> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  const timeoutMs = opts?.timeoutMs ?? KBANK_QR_GENERATE_TIMEOUT_MS
  const token = await fetchKbankAccessToken(timeoutMs, {
    runtime: ctx.runtime,
    reason: 'generate_qr',
  })
  const qrUrl = buildUrl(ctx, 'KBANK_QR_GENERATE_PATH', '/v1/qrpayment/request')
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const body = buildQrPayload(ctx, req)
  const sentQrTypeCode = String(body.qrType || '').trim()
  const requestBodyMasked = maskKbankMessageForLog(body) as Record<string, unknown>
  const cacheKey = tokenCacheKey(ctx)

  const qrHeaders = (accessToken: string) =>
    withProxySecret(
      ctx,
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
      qrUrl
    )

  logKbankTokenMetric({
    event: 'kbank_api_request',
    cacheKey,
    reason: 'generate_qr',
    api: 'generate_qr',
    partnerTxnUidMasked: maskKbankPartnerTxnUid(req.partnerTransactionId),
  })

  try {
    let activeToken = token
    let res = await fetchWithTimeout(
      qrUrl,
      {
        method: 'POST',
        headers: qrHeaders(activeToken.access_token),
        body: JSON.stringify(body),
      },
      timeoutMs
    )
    let text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank QR response is not valid JSON. status=${res.status}`)
    }

    if (res.status === 429 || isKbankRateLimitError(extractKbankErrorMessage(json, '', res.status))) {
      logKbankTokenMetric({
        event: 'kbank_api_429_no_retry',
        cacheKey,
        reason: 'generate_qr',
        httpStatus: res.status,
        api: 'generate_qr',
        partnerTxnUidMasked: maskKbankPartnerTxnUid(req.partnerTransactionId),
      })
    } else if (!res.ok && shouldRetryKbankAuth(res.status, json)) {
      logKbankTokenMetric({
        event: 'kbank_api_401_refresh',
        cacheKey,
        reason: 'generate_qr',
        httpStatus: 401,
        api: 'generate_qr',
        partnerTxnUidMasked: maskKbankPartnerTxnUid(req.partnerTransactionId),
      })
      await clearKbankAccessTokenCacheAsync(cacheKey)
      activeToken = await fetchKbankAccessToken(timeoutMs, {
        runtime: ctx.runtime,
        forceRefresh: true,
        reason: 'http_401_generate_qr',
      })
      res = await fetchWithTimeout(
        qrUrl,
        {
          method: 'POST',
          headers: qrHeaders(activeToken.access_token),
          body: JSON.stringify(body),
        },
        timeoutMs
      )
      text = await res.text()
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    }

    const statusCode = readKbankResponseStatusCode(json, res.status)
    const statusMessage = extractKbankErrorMessage(
      json,
      String(json.statusMessage || json.message || '').trim() || `kbank_generate_qr_failed_http_${res.status}`,
      res.status
    )
    if (!res.ok || !isKbankBusinessSuccess(statusCode)) {
      const responseBodyMasked = maskKbankMessageForLog(json) as Record<string, unknown>
      return {
        ok: false,
        requestId: req.partnerTransactionId,
        statusCode,
        statusMessage,
        response: json,
        requestBodyMasked,
        responseBodyMasked,
        sentQrTypeCode,
      }
    }

    const responseBodyMasked = maskKbankMessageForLog(json) as Record<string, unknown>

    return {
      ok: true,
      requestId: req.partnerTransactionId,
      statusCode,
      statusMessage: statusMessage || 'ok',
      response: json,
      requestBodyMasked,
      responseBodyMasked,
      sentQrTypeCode,
    }
  } catch (err) {
    if (isKbankFetchAbortError(err)) {
      logKbankTokenMetric({
        event: 'kbank_api_timeout',
        cacheKey,
        reason: 'generate_qr',
        api: 'generate_qr',
        detail: `${timeoutMs}ms`,
        partnerTxnUidMasked: maskKbankPartnerTxnUid(req.partnerTransactionId),
      })
      return {
        ok: false,
        requestId: req.partnerTransactionId,
        statusCode: 'TIMEOUT',
        statusMessage: kbankTimeoutMessage('QR generate', timeoutMs),
        response: {},
        requestBodyMasked,
        sentQrTypeCode,
      }
    }
    throw err
  }
}

function buildCheckStatusPayload(
  ctx: KbankCtx,
  req: KbankCheckStatusRequest,
  requestTxnUid: string,
  origPartnerTxnUid?: string
): Record<string, unknown> {
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const { qrType: rawQrType, ...payloadRest } = {
    ...(req.payload || {}),
  } as Record<string, unknown>
  const payload = payloadRest
  const terminalId = String(
    payload.terminalId || req.terminalId || kbankRuntimeField(ctx.runtime, 'KBANK_TERMINAL_ID') || ''
  ).trim()
  const resolvedOrigPartnerTxnUid = String(origPartnerTxnUid || '').trim().slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  if (!resolvedOrigPartnerTxnUid) {
    throw new Error('origPartnerTxnUid is required for Inquire Payment (v5).')
  }
  const rawTxnNo = String(payload.txnNo || req.txnNo || '').trim()
  const qrType = String(rawQrType || '').trim()
  const resolvedTxnNo =
    resolveKbankInquiryTxnNoForRequest(rawTxnNo, { qrType: qrType || undefined }) || ''
  return {
    ...payload,
    partnerTxnUid: requestTxnUid,
    partnerId,
    partnerSecret,
    requestDt: String(payload.requestDt || getBangkokRequestDtIso()),
    merchantId,
    ...(terminalId ? { terminalId } : {}),
    origPartnerTxnUid: resolvedOrigPartnerTxnUid,
    ...(resolvedTxnNo ? { txnNo: resolvedTxnNo } : {}),
  }
}

export async function checkKbankQrStatus(
  req: KbankCheckStatusRequest,
  opts?: KbankClientOpts
): Promise<KbankCheckStatusResult> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  const timeoutMs = opts?.timeoutMs ?? KBANK_DEFAULT_TIMEOUT_MS
  const token = await fetchKbankAccessToken(timeoutMs, {
    runtime: ctx.runtime,
    reason: 'inquiry',
  })
  const statusUrl = buildUrl(ctx, 'KBANK_QR_STATUS_PATH', '/v1/qrpayment/v5/inquiry')
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const payload = (req.payload || {}) as Record<string, unknown>
  const payloadRequestTxnUid = String(payload.partnerTxnUid || '').trim()
  const requestId = normalizePartnerTxnUid(payloadRequestTxnUid || undefined, 'INQ')
  const inferredOrigSource = String(
    payload.origPartnerTxnUid || req.originalTransactionId || req.partnerTransactionId || req.refId || ''
  ).trim()
  const inferredOrigTxnUid = inferredOrigSource
    ? normalizePartnerTxnUid(inferredOrigSource, 'ORIG')
    : ''
  const body = buildCheckStatusPayload(ctx, req, requestId, inferredOrigTxnUid)
  const cacheKey = tokenCacheKey(ctx)

  logKbankTokenMetric({
    event: 'inquiry_request',
    cacheKey,
    reason: 'check_status',
    api: 'inquiry',
    partnerTxnUidMasked: maskKbankPartnerTxnUid(
      inferredOrigTxnUid || req.partnerTransactionId || req.originalTransactionId
    ),
  })

  const inquiryHeaders = (accessToken: string) =>
    withProxySecret(
      ctx,
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
      statusUrl
    )

  try {
    let activeToken = token
    let res = await fetchWithTimeout(
      statusUrl,
      {
        method: 'POST',
        headers: inquiryHeaders(activeToken.access_token),
        body: JSON.stringify(body),
      },
      timeoutMs
    )
    let text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank inquiry response is not valid JSON. status=${res.status}`)
    }

    if (res.status === 429 || isKbankRateLimitError(extractKbankErrorMessage(json, '', res.status))) {
      logKbankTokenMetric({
        event: 'kbank_api_429_no_retry',
        cacheKey,
        reason: 'inquiry',
        httpStatus: res.status,
        api: 'inquiry',
        partnerTxnUidMasked: maskKbankPartnerTxnUid(inferredOrigTxnUid || req.partnerTransactionId),
      })
    } else if (!res.ok && shouldRetryKbankAuth(res.status, json)) {
      logKbankTokenMetric({
        event: 'kbank_api_401_refresh',
        cacheKey,
        reason: 'inquiry',
        httpStatus: 401,
        api: 'inquiry',
      })
      await clearKbankAccessTokenCacheAsync(cacheKey)
      activeToken = await fetchKbankAccessToken(timeoutMs, {
        runtime: ctx.runtime,
        forceRefresh: true,
        reason: 'http_401_inquiry',
      })
      res = await fetchWithTimeout(
        statusUrl,
        {
          method: 'POST',
          headers: inquiryHeaders(activeToken.access_token),
          body: JSON.stringify(body),
        },
        timeoutMs
      )
      text = await res.text()
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    }

    const statusCode = readKbankResponseStatusCode(json, res.status)
    const successMessage = String(json.statusMessage || json.message || json.errorDesc || '').trim()
    if (!res.ok || !isKbankBusinessSuccess(statusCode)) {
      const statusMessage = extractKbankErrorMessage(
        json,
        successMessage || `kbank_check_status_failed_http_${res.status}`,
        res.status
      )
      return {
        ok: false,
        requestId,
        statusCode,
        statusMessage,
        response: json,
      }
    }

    return {
      ok: true,
      requestId,
      statusCode,
      statusMessage: successMessage || 'ok',
      response: json,
    }
  } catch (err) {
    if (isKbankFetchAbortError(err)) {
      logKbankTokenMetric({
        event: 'kbank_api_timeout',
        cacheKey,
        reason: 'inquiry',
        api: 'inquiry',
        detail: `${timeoutMs}ms`,
        partnerTxnUidMasked: maskKbankPartnerTxnUid(inferredOrigTxnUid || req.partnerTransactionId),
      })
      return {
        ok: false,
        requestId,
        statusCode: 'TIMEOUT',
        statusMessage: kbankTimeoutMessage('inquiry', timeoutMs),
        response: {},
      }
    }
    throw err
  }
}

function buildTxnPayload(
  ctx: KbankCtx,
  req:
    | KbankCancelQrRequest
    | KbankVoidPaymentRequest
    | KbankSettlementRequest,
  requestTxnUid: string,
  options?: {
    includeOrigPartnerTxnUid?: boolean
    requireOrigPartnerTxnUid?: boolean
    requireTerminalId?: boolean
    includeQrType?: boolean
    includeTxnNo?: boolean
  }
): Record<string, unknown> {
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const payloadIn = { ...(req.payload || {}) } as Record<string, unknown>
  const qrTypeHint = String(
    payloadIn.qrType ||
      ('qrType' in req ? String((req as { qrType?: string }).qrType || '') : '') ||
      ''
  ).trim()
  const payload = stripDisallowedKbankActionPayloadFields(
    payloadIn,
    { includeQrType: options?.includeQrType, includeTxnNo: options?.includeTxnNo }
  )
  const reqTerminalId =
    'terminalId' in req ? String((req as { terminalId?: string }).terminalId || '').trim() : ''
  const reqQrType = 'qrType' in req ? String((req as { qrType?: string }).qrType || '').trim() : ''
  const reqTxnNo = 'txnNo' in req ? String((req as { txnNo?: string }).txnNo || '').trim() : ''
  const reqOrigPartnerTxnUid =
    'origPartnerTxnUid' in req
      ? String((req as { origPartnerTxnUid?: string }).origPartnerTxnUid || '').trim()
      : ''
  const terminalId = String(
    payload.terminalId || reqTerminalId || kbankRuntimeField(ctx.runtime, 'KBANK_TERMINAL_ID') || ''
  ).trim()
  if (options?.requireTerminalId && !terminalId) {
    throw new Error('terminalId is required (set KBANK_TERMINAL_ID or pass terminalId).')
  }
  const rawOrigPartnerTxnUid = String(
    payload.origPartnerTxnUid ||
      reqOrigPartnerTxnUid ||
      req.partnerTransactionId ||
      req.originalTransactionId ||
      ''
  ).trim()
  const origPartnerTxnUid = options?.includeOrigPartnerTxnUid
    ? (rawOrigPartnerTxnUid ? rawOrigPartnerTxnUid.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN) : '')
    : ''
  if (options?.requireOrigPartnerTxnUid && !origPartnerTxnUid) {
    throw new Error('origPartnerTxnUid is required for Void/Cancel.')
  }
  const qrType = options?.includeQrType
    ? resolveKbankQrTypeCode(
        String(
          payload.qrType ||
            reqQrType ||
            kbankRuntimeField(ctx.runtime, 'KBANK_QR_TYPE_THAI') ||
            '3'
        ).trim() || undefined
      )
    : ''
  const rawTxnNo = options?.includeTxnNo
    ? String(payload.txnNo || reqTxnNo || '').trim()
    : ''
  const resolvedTxnNo = options?.includeTxnNo
    ? resolveKbankVoidTxnNoForRequest(rawTxnNo, { qrType: qrTypeHint }) || ''
    : ''
  return {
    ...payload,
    partnerTxnUid: requestTxnUid,
    partnerId,
    partnerSecret,
    requestDt: String(payload.requestDt || getBangkokRequestDtIso()),
    merchantId,
    ...(terminalId ? { terminalId } : {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(qrType ? { qrType } : {}),
    ...(resolvedTxnNo ? { txnNo: resolvedTxnNo } : {}),
  }
}

async function callKbankActionApi(
  ctx: KbankCtx,
  pathEnvName: string,
  defaultPath: string,
  req:
    | KbankCancelQrRequest
    | KbankVoidPaymentRequest
    | KbankSettlementRequest,
  fallbackRequestPrefix: string,
  timeoutMs = KBANK_DEFAULT_TIMEOUT_MS,
  payloadOptions?: {
    includeOrigPartnerTxnUid?: boolean
    requireOrigPartnerTxnUid?: boolean
    requireTerminalId?: boolean
    includeQrType?: boolean
    includeTxnNo?: boolean
  }
): Promise<{
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}> {
  const token = await fetchKbankAccessToken(timeoutMs, {
    runtime: ctx.runtime,
    reason: `action_${fallbackRequestPrefix}`,
  })
  const url = buildUrl(ctx, pathEnvName, defaultPath)
  const partnerId = mustEnvCtx(ctx, 'KBANK_PARTNER_ID')
  const partnerSecret = mustEnvCtx(ctx, 'KBANK_PARTNER_SECRET')
  const merchantId = mustEnvCtx(ctx, 'KBANK_MERCHANT_ID')
  const payloadPartnerTxnUid =
    req.payload && typeof req.payload === 'object'
      ? String((req.payload as Record<string, unknown>).partnerTxnUid || '').trim()
      : ''
  const requestId = normalizePartnerTxnUid(payloadPartnerTxnUid || undefined, fallbackRequestPrefix)

  const requestBody = buildTxnPayload(ctx, req, requestId, payloadOptions)
  const cacheKey = tokenCacheKey(ctx)
  const actionHeaders = (accessToken: string) =>
    withProxySecret(
      ctx,
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
      url
    )
  try {
    let activeToken = token
    let res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: actionHeaders(activeToken.access_token),
        body: JSON.stringify(requestBody),
      },
      timeoutMs
    )
    let text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank API response is not valid JSON. status=${res.status}`)
    }

    if (res.status === 429 || isKbankRateLimitError(extractKbankErrorMessage(json, '', res.status))) {
      logKbankTokenMetric({
        event: 'kbank_api_429_no_retry',
        cacheKey,
        reason: pathEnvName,
        httpStatus: res.status,
        api: 'action',
      })
    } else if (!res.ok && shouldRetryKbankAuth(res.status, json)) {
      logKbankTokenMetric({
        event: 'kbank_api_401_refresh',
        cacheKey,
        reason: pathEnvName,
        httpStatus: 401,
        api: 'action',
      })
      await clearKbankAccessTokenCacheAsync(cacheKey)
      activeToken = await fetchKbankAccessToken(timeoutMs, {
        runtime: ctx.runtime,
        forceRefresh: true,
        reason: `http_401_${fallbackRequestPrefix}`,
      })
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: actionHeaders(activeToken.access_token),
          body: JSON.stringify(requestBody),
        },
        timeoutMs
      )
      text = await res.text()
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    }

    const statusCode = readKbankResponseStatusCode(json, res.status)
    const statusMessage = extractKbankErrorMessage(
      json,
      String(json.statusMessage || json.message || '').trim() || 'kbank_action_failed',
      res.status
    )
    const businessOk = isKbankBusinessSuccess(statusCode)
    if (!res.ok || !businessOk) {
      return {
        ok: false,
        requestId,
        statusCode,
        statusMessage,
        response: json,
      }
    }
    return {
      ok: true,
      requestId,
      statusCode,
      statusMessage: statusMessage || 'ok',
      response: json,
    }
  } catch (err) {
    if (isKbankFetchAbortError(err)) {
      logKbankTokenMetric({
        event: 'kbank_api_timeout',
        cacheKey,
        reason: pathEnvName,
        api: 'action',
        detail: `${timeoutMs}ms`,
      })
      return {
        ok: false,
        requestId,
        statusCode: 'TIMEOUT',
        statusMessage: kbankTimeoutMessage(fallbackRequestPrefix, timeoutMs),
        response: {},
      }
    }
    throw err
  }
}

export async function cancelKbankQr(
  req: KbankCancelQrRequest,
  opts?: KbankClientOpts
): Promise<KbankCancelQrResult> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  return callKbankActionApi(
    ctx,
    'KBANK_QR_CANCEL_PATH',
    '/v1/qrpayment/cancel',
    req,
    'CCH',
    opts?.timeoutMs ?? KBANK_DEFAULT_TIMEOUT_MS,
    { includeOrigPartnerTxnUid: true, requireOrigPartnerTxnUid: true, requireTerminalId: false }
  )
}

export async function voidKbankPayment(
  req: KbankVoidPaymentRequest,
  opts?: KbankClientOpts
): Promise<KbankVoidPaymentResult> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  return callKbankActionApi(
    ctx,
    'KBANK_QR_VOID_PATH',
    '/v1/qrpayment/void',
    req,
    'VOD',
    opts?.timeoutMs ?? KBANK_DEFAULT_TIMEOUT_MS,
    {
      includeOrigPartnerTxnUid: true,
      requireOrigPartnerTxnUid: true,
      requireTerminalId: false,
      includeTxnNo: true,
    }
  )
}

export async function settleKbankPayment(
  req: KbankSettlementRequest,
  opts?: KbankClientOpts
): Promise<KbankSettlementResult> {
  const ctx: KbankCtx = { runtime: opts?.runtime }
  const qrTypeRaw = String(req.qrType || (req.payload as Record<string, unknown> | undefined)?.qrType || '')
    .trim()
    .toUpperCase()
  if (qrTypeRaw === 'CREDIT_CARD' || qrTypeRaw === 'QRCC' || qrTypeRaw === '5') {
    return {
      ok: false,
      requestId: '',
      statusCode: 'SETTLEMENT_NOT_SUPPORTED',
      statusMessage:
        'Manual Settlement API is not supported for Credit Card QR. Thai QR (qrType 3) only.',
      response: {},
    }
  }
  return callKbankActionApi(
    ctx,
    'KBANK_QR_SETTLEMENT_PATH',
    '/v1/qrpayment/settlement',
    req,
    'STM',
    opts?.timeoutMs ?? KBANK_DEFAULT_TIMEOUT_MS,
    { requireTerminalId: true, includeQrType: true }
  )
}
