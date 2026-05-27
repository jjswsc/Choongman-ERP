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

function mustEnv(name: string): string {
  const v = String(process.env[name] || '').trim()
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`)
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
    return ' (프록시 경유 환경으로 보이지만 KBANK_PROXY_SECRET 환경변수가 없습니다.)'
  }
  return ' (프록시 시크릿 불일치 또는 프록시 접근 정책을 확인하세요.)'
}

function pickFirstNonEmpty(values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function extractKbankErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const errorObj =
    json.error && typeof json.error === 'object' && !Array.isArray(json.error)
      ? (json.error as Record<string, unknown>)
      : null
  const firstError =
    Array.isArray(json.errors) && json.errors[0] && typeof json.errors[0] === 'object'
      ? (json.errors[0] as Record<string, unknown>)
      : null
  const msg = pickFirstNonEmpty([
    json.statusMessage,
    json.message,
    json.errorDesc,
    json.error_description,
    json.detail,
    errorObj?.statusMessage,
    errorObj?.message,
    errorObj?.detail,
    errorObj?.description,
    firstError?.message,
    firstError?.detail,
  ])
  return msg || fallback
}

function resolveKbankQrTypeCode(input: string | undefined): string {
  const raw = String(input || '').trim().toUpperCase()
  if (!raw || raw === 'THAI_QR' || raw === 'THQR' || raw === '3') {
    return String(process.env.KBANK_QR_TYPE_THAI || '3').trim() || '3'
  }
  if (raw === 'CREDIT_CARD' || raw === 'QRCC' || raw === '5') {
    return String(process.env.KBANK_QR_TYPE_CREDIT || '5').trim() || '5'
  }
  return raw
}

function normalizePartnerTxnUid(seed: string | undefined, fallbackPrefix: string): string {
  const clean = String(seed || '').trim()
  if (clean) return clean.slice(0, 15)
  return `${fallbackPrefix}${Date.now()}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 15)
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs))
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(timer),
  }
}

export async function fetchKbankAccessToken(timeoutMs = 12000): Promise<KbankTokenResponse> {
  const consumerId = mustEnv('KBANK_CONSUMER_ID')
  const consumerSecret = mustEnv('KBANK_CONSUMER_SECRET')
  const tokenUrl = buildUrl('KBANK_TOKEN_PATH', '/v2/oauth/token')
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
      throw new Error(`kbank_token_http_${res.status}${buildProxyHint(tokenUrl, res.status)}: ${text.slice(0, 300)}`)
    }
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('KBank 토큰 응답이 JSON 형식이 아닙니다.')
    }
    const accessToken = String(json.access_token || '').trim()
    if (!accessToken) {
      throw new Error(`KBank 토큰 응답에 access_token이 없습니다: ${text.slice(0, 300)}`)
    }
    return {
      access_token: accessToken,
      token_type: String(json.token_type || '').trim() || undefined,
      expires_in: Number(json.expires_in || 0) || undefined,
      scope: String(json.scope || '').trim() || undefined,
    }
  } finally {
    clear()
  }
}

function buildQrPayload(req: KbankGenerateQrRequest): Record<string, unknown> {
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) } as Record<string, unknown>
  const partnerTxnUid = String(req.partnerTransactionId || '').trim().slice(0, 15)
  const reference1 = String(req.reference1 || '').trim() || partnerTxnUid
  const terminalId = String(process.env.KBANK_TERMINAL_ID || '').trim()
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

  const { signal, clear } = timeoutSignal(opts?.timeoutMs ?? 12000)
  try {
    const res = await fetch(qrUrl, {
      method: 'POST',
      headers: withProxySecret(
        {
          Authorization: `Bearer ${token.access_token}`,
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
    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank QR 응답이 JSON 형식이 아닙니다. status=${res.status}`)
    }

    if (!res.ok) {
      const statusCode = String(json.statusCode || json.code || '').trim() || String(res.status)
      const statusMessage = extractKbankErrorMessage(
        json,
        `kbank_generate_qr_failed_http_${res.status}`
      )
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
      statusCode: String(json.statusCode || json.code || '').trim() || '200',
      statusMessage: String(json.statusMessage || json.message || '').trim() || 'ok',
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
  if (!terminalId) {
    throw new Error('KBANK_TERMINAL_ID 누락: Inquire Payment(v4)에는 terminalId가 필수입니다.')
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
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(resolvedTxnNo ? { txnNo: resolvedTxnNo } : {}),
    // Backward-compatible keys
    partnerTransactionId: req.partnerTransactionId || undefined,
    originalTransactionId: req.originalTransactionId || undefined,
    refId: req.refId || undefined,
  }
}

export async function checkKbankQrStatus(
  req: KbankCheckStatusRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankCheckStatusResult> {
  const token = await fetchKbankAccessToken(opts?.timeoutMs ?? 12000)
  const statusUrl = buildUrl('KBANK_QR_STATUS_PATH', '/v1/qrpayment/v4/inquiry')
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = (req.payload || {}) as Record<string, unknown>
  const payloadRequestTxnUid = String(payload.partnerTxnUid || '').trim()
  const requestId = normalizePartnerTxnUid(payloadRequestTxnUid || undefined, 'INQ')
  const inferredOrigTxnUid = normalizePartnerTxnUid(
    String(payload.origPartnerTxnUid || req.originalTransactionId || req.partnerTransactionId || req.refId || '').trim() ||
      undefined,
    'ORIG'
  )
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
      throw new Error(`KBank 상태조회 응답이 JSON 형식이 아닙니다. status=${res.status}`)
    }

    if (!res.ok) {
      const statusCode = String(json.statusCode || json.code || '').trim() || String(res.status)
      const statusMessage = extractKbankErrorMessage(json, `kbank_check_status_failed_http_${res.status}`)
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
      statusCode: String(json.statusCode || json.code || '').trim() || '200',
      statusMessage: String(json.statusMessage || json.message || '').trim() || 'ok',
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
    throw new Error('KBANK_TERMINAL_ID 누락: terminalId가 필수입니다.')
  }
  const rawOrigPartnerTxnUid = String(
    payload.origPartnerTxnUid ||
      reqOrigPartnerTxnUid ||
      req.partnerTransactionId ||
      req.originalTransactionId ||
      ''
  ).trim()
  const origPartnerTxnUid = options?.includeOrigPartnerTxnUid
    ? (rawOrigPartnerTxnUid ? rawOrigPartnerTxnUid.slice(0, 15) : '')
    : ''
  if (options?.requireOrigPartnerTxnUid && !origPartnerTxnUid) {
    throw new Error('origPartnerTxnUid 누락: Void/Cancel에는 원거래 ID가 필수입니다.')
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

  const { signal, clear } = timeoutSignal(timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: withProxySecret(
        {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          'X-Partner-Id': partnerId,
          'X-Partner-Secret': partnerSecret,
          'X-Merchant-Id': merchantId,
        },
        url
      ),
      body: JSON.stringify(buildTxnPayload(req, requestId, payloadOptions)),
      cache: 'no-store',
      signal,
    })
    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`KBank API 응답이 JSON 형식이 아닙니다. status=${res.status}`)
    }
    if (!res.ok) {
      return {
        ok: false,
        requestId,
        statusCode: String(json.statusCode || json.code || '').trim() || String(res.status),
        statusMessage:
          String(json.statusMessage || json.message || '').trim() || 'kbank_action_failed',
        response: json,
      }
    }
    return {
      ok: true,
      requestId,
      statusCode: String(json.statusCode || json.code || '').trim() || '200',
      statusMessage: String(json.statusMessage || json.message || '').trim() || 'ok',
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
    'CNL',
    opts?.timeoutMs ?? 12000,
    { includeOrigPartnerTxnUid: true, requireOrigPartnerTxnUid: true, requireTerminalId: true }
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
    'VOID',
    opts?.timeoutMs ?? 12000,
    {
      includeOrigPartnerTxnUid: true,
      requireOrigPartnerTxnUid: true,
      requireTerminalId: true,
      includeTxnNo: true,
    }
  )
}

export async function settleKbankPayment(
  req: KbankSettlementRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankSettlementResult> {
  return callKbankActionApi(
    'KBANK_QR_SETTLEMENT_PATH',
    '/v1/qrpayment/settlement',
    req,
    'SETTLE',
    opts?.timeoutMs ?? 12000,
    { requireTerminalId: true, includeQrType: true }
  )
}
