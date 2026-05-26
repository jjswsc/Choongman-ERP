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
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      cache: 'no-store',
      signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`kbank_token_http_${res.status}: ${text.slice(0, 300)}`)
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
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) }

  // 기본 키를 심어두되, payload에 동일 키가 있으면 payload 값을 우선 사용한다.
  return {
    partnerId,
    merchantId,
    partnerTransactionId: req.partnerTransactionId,
    partnerTxnUid: req.partnerTransactionId,
    amount: Number(req.amount),
    qrType: req.qrType || undefined,
    reference1: req.reference1 || undefined,
    reference2: req.reference2 || undefined,
    reference3: req.reference3 || undefined,
    reference4: req.reference4 || undefined,
    ...payload,
  }
}

export async function generateKbankQr(
  req: KbankGenerateQrRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankGenerateQrResult> {
  const token = await fetchKbankAccessToken(opts?.timeoutMs ?? 12000)
  const qrUrl = buildUrl('KBANK_QR_GENERATE_PATH', '/qr/v1/generate')
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const body = buildQrPayload(req)

  const { signal, clear } = timeoutSignal(opts?.timeoutMs ?? 12000)
  try {
    const res = await fetch(qrUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
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
      const statusMessage = String(json.statusMessage || json.message || '').trim() || 'kbank_generate_qr_failed'
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

function buildCheckStatusPayload(req: KbankCheckStatusRequest): Record<string, unknown> {
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) }
  return {
    partnerId,
    merchantId,
    partnerTransactionId: req.partnerTransactionId || undefined,
    originalTransactionId: req.originalTransactionId || undefined,
    refId: req.refId || undefined,
    ...payload,
  }
}

export async function checkKbankQrStatus(
  req: KbankCheckStatusRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankCheckStatusResult> {
  const token = await fetchKbankAccessToken(opts?.timeoutMs ?? 12000)
  const statusUrl = buildUrl('KBANK_QR_STATUS_PATH', '/qr/v1/check-status')
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const partnerSecret = mustEnv('KBANK_PARTNER_SECRET')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const requestId =
    String(req.partnerTransactionId || req.originalTransactionId || req.refId || '').trim() ||
    `CHK${Date.now()}`
  const body = buildCheckStatusPayload(req)

  const { signal, clear } = timeoutSignal(opts?.timeoutMs ?? 12000)
  try {
    const res = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
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
      const statusMessage = String(json.statusMessage || json.message || '').trim() || 'kbank_check_status_failed'
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
    | KbankSettlementRequest
): Record<string, unknown> {
  const partnerId = mustEnv('KBANK_PARTNER_ID')
  const merchantId = mustEnv('KBANK_MERCHANT_ID')
  const payload = { ...(req.payload || {}) }
  return {
    partnerId,
    merchantId,
    partnerTransactionId: req.partnerTransactionId || undefined,
    originalTransactionId: req.originalTransactionId || undefined,
    refId: req.refId || undefined,
    ...payload,
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
  timeoutMs = 12000
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
  const requestId =
    String(req.partnerTransactionId || req.originalTransactionId || req.refId || '').trim() ||
    `${fallbackRequestPrefix}${Date.now()}`

  const { signal, clear } = timeoutSignal(timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Partner-Id': partnerId,
        'X-Partner-Secret': partnerSecret,
        'X-Merchant-Id': merchantId,
      },
      body: JSON.stringify(buildTxnPayload(req)),
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
    '/qr/v1/cancel',
    req,
    'CNL',
    opts?.timeoutMs ?? 12000
  )
}

export async function voidKbankPayment(
  req: KbankVoidPaymentRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankVoidPaymentResult> {
  return callKbankActionApi(
    'KBANK_QR_VOID_PATH',
    '/qr/v1/void',
    req,
    'VOID',
    opts?.timeoutMs ?? 12000
  )
}

export async function settleKbankPayment(
  req: KbankSettlementRequest,
  opts?: { timeoutMs?: number }
): Promise<KbankSettlementResult> {
  return callKbankActionApi(
    'KBANK_QR_SETTLEMENT_PATH',
    '/qr/v1/settlement',
    req,
    'SETTLE',
    opts?.timeoutMs ?? 12000
  )
}
