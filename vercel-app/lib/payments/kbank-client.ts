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
  readKbankResponseStatusCode,
  resolveKbankQrTypeCode,
} from '@/lib/payments/kbank-api-reference'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function mustEnv(name: string): string {
  const v = String(process.env[name] || '').trim()
  if (!v) throw new Error(`${name} environment variable is required.`)
  return v
}

function stripTrailingSlash(v: string): string {
  return v.replace(/\/+$/, '')
}

function normalizePath(v: string): string {
  if (!v) return ''
  return v.startsWith('/') ? v : `/${v}`
}

function buildUrl(pathEnvName: string, defaultPath: string): string {
  const base = stripTrailingSlash(mustEnv('KBANK_OPENAPI_BASE_URL'))
  const p = normalizePath(String(process.env[pathEnvName] || '').trim() || defaultPath)
  return `${base}${p}`
}

function buildTokenUrl(defaultPath: string): string {
  const tokenBase = String(process.env.KBANK_OAUTH_BASE_URL || '').trim()
  const base = stripTrailingSlash(tokenBase || mustEnv('KBANK_OPENAPI_BASE_URL'))
  const p = normalizePath(String(process.env.KBANK_TOKEN_PATH || '').trim() || defaultPath)
  return `${base}${p}`
}

function getProxySecret(): string {
  return String(process.env.KBANK_PROXY_SECRET || '').trim()
}

function isLikelyProxyUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    return !(host.includes('kasikornbank.com') || host.includes('kbank.com'))
  } catch {
    return false
  }
}

function withProxySecret(headers: Record<string, string>, _urlStr: string): Record<string, string> {
  const proxySecret = getProxySecret()
  if (proxySecret) {
    return {
      ...headers,
      'X-Proxy-Secret': proxySecret,
    }
  }
  return headers
}

function buildProxyHint(urlStr: string, status: number): string {
  if (status !== 403 || !isLikelyProxyUrl(urlStr)) return ''
  if (!getProxySecret()) {
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

type CachedKbankToken = {
  token: KbankTokenResponse
  expiresAtMs: number
}

let cachedKbankToken: CachedKbankToken | null = null
let inFlightKbankTokenPromise: Promise<KbankTokenResponse> | null = null

export function clearKbankAccessTokenCache(): void {
  cachedKbankToken = null
  inFlightKbankTokenPromise = null
}

function isUsableCachedToken(nowMs: number): boolean {
  if (!cachedKbankToken) return false
  const token = String(cachedKbankToken.token.access_token || '').trim()
  if (!token) return false
  return cachedKbankToken.expiresAtMs > nowMs
}

export async function fetchKbankAccessToken(timeoutMs = 12000): Promise<KbankTokenResponse> {
  const nowMs = Date.now()
  if (isUsableCachedToken(nowMs)) {
    return cachedKbankToken!.token
  }
  if (inFlightKbankTokenPromise) {
    return inFlightKbankTokenPromise
  }

  inFlightKbankTokenPromise = (async () => {
    const consumerId = mustEnv('KBANK_CONSUMER_ID')
    const consumerSecret = mustEnv('KBANK_CONSUMER_SECRET')
    const tokenUrl = buildTokenUrl('/v2/oauth/token')
    const scope = String(process.env.KBANK_TOKEN_SCOPE || '').trim()

    const form = new URLSearchParams()
    form.set('grant_type', 'client_credentials')
    if (scope) form.set('scope', scope)

    const basic = Buffer.from(`${consumerId}:${consumerSecret}`).toString('base64')
    const { signal, clear } = timeoutSignal(timeoutMs)
    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: withProxySecret(
          {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          tokenUrl
        ),
        body: form.toString(),
        cache: 'no-store',
        signal,
      })
      const text = await res.text()
      if (!res.ok) {
        let detail = text.slice(0, 300)
        try {
          const errJson = text ? (JSON.parse(text) as Record<string, unknown>) : {}
          detail = extractKbankErrorMessage(errJson, detail, res.status)
        } catch {
          /* keep raw */
        }
        throw new Error(`${detail}${buildProxyHint(tokenUrl, res.status)}`)
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
      // 만료 직전의 토큰 재사용으로 인한 401을 피하기 위해, 30초 전에 갱신하도록 여유를 둔다.
      const ttlMs = Math.max(60_000, (expiresInSec > 0 ? expiresInSec : 300) * 1000)
      const safeExpiresAtMs = Date.now() + ttlMs - 30_000
      cachedKbankToken = {
        token,
        expiresAtMs: safeExpiresAtMs,
      }
      return token
    } finally {
      clear()
    }
  })()
  try {
    return await inFlightKbankTokenPromise
  } finally {
    inFlightKbankTokenPromise = null
  }
}

function buildQrPayload(req: KbankGenerateQrRequest): Record<string, unknown> {
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) } as Record<string, unknown>
  const partnerTxnUid = String(req.partnerTransactionId || '')
    .trim()
    .slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const reference1 = String(req.reference1 || '').trim() || partnerTxnUid
  const terminalId = String(
    payload.terminalId || process.env.KBANK_TERMINAL_ID || ''
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
  opts?: { timeoutMs?: number }
): Promise<KbankGenerateQrResult> {
  const token = await fetchKbankAccessToken(opts?.timeoutMs ?? 12000)
  const qrUrl = buildUrl('KBANK_QR_GENERATE_PATH', '/v1/qrpayment/request')
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const body = buildQrPayload(req)

  const timeoutMs = opts?.timeoutMs ?? 12000
  const { signal, clear } = timeoutSignal(timeoutMs)
  try {
    let activeToken = token
    let res = await fetch(qrUrl, {
      method: 'POST',
      headers: withProxySecret(
        {
          Authorization: `Bearer ${activeToken.access_token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': partnerId,
          'X-Partner-Secret': partnerSecret,
          'X-Merchant-Id': merchantId,
        },
        qrUrl
      ),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    })
    let text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank QR response is not valid JSON. status=${res.status}`)
    }

    if (!res.ok && shouldRetryKbankAuth(res.status, json)) {
      clearKbankAccessTokenCache()
      activeToken = await fetchKbankAccessToken(timeoutMs)
      res = await fetch(qrUrl, {
        method: 'POST',
        headers: withProxySecret(
          {
            Authorization: `Bearer ${activeToken.access_token}`,
            'Content-Type': 'application/json',
            'X-Partner-Id': partnerId,
            'X-Partner-Secret': partnerSecret,
            'X-Merchant-Id': merchantId,
          },
          qrUrl
        ),
        body: JSON.stringify(body),
        cache: 'no-store',
        signal,
      })
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
      return {
        ok: false,
        requestId: req.partnerTransactionId,
        statusCode,
        statusMessage,
        response: json,
      }
    }

    return {
      ok: true,
      requestId: req.partnerTransactionId,
      statusCode,
      statusMessage: statusMessage || 'ok',
      response: json,
    }
  } finally {
    clear()
  }
}

function buildCheckStatusPayload(
  req: KbankCheckStatusRequest,
  requestTxnUid: string,
  origPartnerTxnUid?: string
): Record<string, unknown> {
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) } as Record<string, unknown>
  const terminalId = String(payload.terminalId || req.terminalId || process.env.KBANK_TERMINAL_ID || '').trim()
  const resolvedOrigPartnerTxnUid = String(origPartnerTxnUid || '').trim().slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  if (!resolvedOrigPartnerTxnUid) {
    throw new Error('origPartnerTxnUid is required for Inquire Payment (v5).')
  }
  const resolvedTxnNo = String(payload.txnNo || req.txnNo || '').trim()
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
  opts?: { timeoutMs?: number }
): Promise<KbankCheckStatusResult> {
  const token = await fetchKbankAccessToken(opts?.timeoutMs ?? 12000)
  const statusUrl = buildUrl('KBANK_QR_STATUS_PATH', '/v1/qrpayment/v5/inquiry')
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = (req.payload || {}) as Record<string, unknown>
  const payloadRequestTxnUid = String(payload.partnerTxnUid || '').trim()
  const requestId = normalizePartnerTxnUid(payloadRequestTxnUid || undefined, 'INQ')
  const inferredOrigSource = String(
    payload.origPartnerTxnUid || req.originalTransactionId || req.partnerTransactionId || req.refId || ''
  ).trim()
  const inferredOrigTxnUid = inferredOrigSource
    ? normalizePartnerTxnUid(inferredOrigSource, 'ORIG')
    : ''
  const body = buildCheckStatusPayload(req, requestId, inferredOrigTxnUid)

  const { signal, clear } = timeoutSignal(opts?.timeoutMs ?? 12000)
  try {
    const res = await fetch(statusUrl, {
      method: 'POST',
      headers: withProxySecret(
        {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': partnerId,
          'X-Partner-Secret': partnerSecret,
          'X-Merchant-Id': merchantId,
        },
        statusUrl
      ),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal,
    })
    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank inquiry response is not valid JSON. status=${res.status}`)
    }

    const statusCode = readKbankResponseStatusCode(json, res.status)
    const statusMessage = extractKbankErrorMessage(
      json,
      String(json.statusMessage || json.message || '').trim() || `kbank_check_status_failed_http_${res.status}`,
      res.status
    )
    if (!res.ok || !isKbankBusinessSuccess(statusCode)) {
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
  } finally {
    clear()
  }
}

function buildTxnPayload(
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
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) } as Record<string, unknown>
  const reqTerminalId =
    'terminalId' in req ? String((req as { terminalId?: string }).terminalId || '').trim() : ''
  const reqQrType = 'qrType' in req ? String((req as { qrType?: string }).qrType || '').trim() : ''
  const reqTxnNo = 'txnNo' in req ? String((req as { txnNo?: string }).txnNo || '').trim() : ''
  const reqOrigPartnerTxnUid =
    'origPartnerTxnUid' in req
      ? String((req as { origPartnerTxnUid?: string }).origPartnerTxnUid || '').trim()
      : ''
  const terminalId = String(payload.terminalId || reqTerminalId || process.env.KBANK_TERMINAL_ID || '').trim()
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
        String(payload.qrType || reqQrType || process.env.KBANK_QR_TYPE_THAI || '3').trim() || undefined
      )
    : ''
  const resolvedTxnNo = options?.includeTxnNo
    ? String(payload.txnNo || reqTxnNo || '').trim()
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
    // Backward-compatible keys
    partnerTransactionId: req.partnerTransactionId || undefined,
    originalTransactionId: req.originalTransactionId || undefined,
    refId: req.refId || undefined,
  }
}

async function callKbankActionApi(
  pathEnvName: string,
  defaultPath: string,
  req:
    | KbankCancelQrRequest
    | KbankVoidPaymentRequest
    | KbankSettlementRequest,
  fallbackRequestPrefix: string,
  timeoutMs = 12000,
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
  const token = await fetchKbankAccessToken(timeoutMs)
  const url = buildUrl(pathEnvName, defaultPath)
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payloadPartnerTxnUid =
    req.payload && typeof req.payload === 'object'
      ? String((req.payload as Record<string, unknown>).partnerTxnUid || '').trim()
      : ''
  const requestId = normalizePartnerTxnUid(payloadPartnerTxnUid || undefined, fallbackRequestPrefix)

  const requestBody = buildTxnPayload(req, requestId, payloadOptions)
  const { signal, clear } = timeoutSignal(timeoutMs)
  try {
    let activeToken = token
    let res = await fetch(url, {
      method: 'POST',
      headers: withProxySecret(
        {
          Authorization: `Bearer ${activeToken.access_token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': partnerId,
          'X-Partner-Secret': partnerSecret,
          'X-Merchant-Id': merchantId,
        },
        url
      ),
      body: JSON.stringify(requestBody),
      cache: 'no-store',
      signal,
    })
    let text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank API response is not valid JSON. status=${res.status}`)
    }

    if (!res.ok && shouldRetryKbankAuth(res.status, json)) {
      clearKbankAccessTokenCache()
      activeToken = await fetchKbankAccessToken(timeoutMs)
      res = await fetch(url, {
        method: 'POST',
        headers: withProxySecret(
          {
            Authorization: `Bearer ${activeToken.access_token}`,
            'Content-Type': 'application/json',
            'X-Partner-Id': partnerId,
            'X-Partner-Secret': partnerSecret,
            'X-Merchant-Id': merchantId,
          },
          url
        ),
        body: JSON.stringify(requestBody),
        cache: 'no-store',
        signal,
      })
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
  } finally {
    clear()
  }
}

export async function cancelKbankQr(
  req: KbankCancelQrRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankCancelQrResult> {
  return callKbankActionApi(
    'KBANK_QR_CANCEL_PATH',
    '/v1/qrpayment/cancel',
    req,
    'CCH',
    opts?.timeoutMs ?? 12000,
    { includeOrigPartnerTxnUid: true, requireOrigPartnerTxnUid: true, requireTerminalId: false }
  )
}

export async function voidKbankPayment(
  req: KbankVoidPaymentRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankVoidPaymentResult> {
  return callKbankActionApi(
    'KBANK_QR_VOID_PATH',
    '/v1/qrpayment/void',
    req,
    'VOD',
    opts?.timeoutMs ?? 12000,
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
  opts?: { timeoutMs?: number }
): Promise<KbankSettlementResult> {
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
    'KBANK_QR_SETTLEMENT_PATH',
    '/v1/qrpayment/settlement',
    req,
    'STM',
    opts?.timeoutMs ?? 12000,
    { requireTerminalId: true, includeQrType: true }
  )
}
