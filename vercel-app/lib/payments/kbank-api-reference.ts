/**
 * KBank QR Payment API Reference — status / qrType / txnStatus / errorCode mapping.
 * User-facing API errors default to English (bank message preferred when present).
 */

export type KbankPosTxnStatus = 'approved' | 'declined' | 'pending' | 'failed'

/** statusCode: 00=Success, 10=Error, 11=Cancelled payment */
export const KBANK_STATUS_CODE_SUCCESS = '00'
export const KBANK_STATUS_CODE_ERROR = '10'
export const KBANK_STATUS_CODE_CANCELLED = '11'

/** qrType: 3=ThaiQR, 4=Credit Card, 5=Thai QR + Credit Card */
export const KBANK_QR_TYPE_THAI = '3'
export const KBANK_QR_TYPE_CREDIT_CARD = '4'
export const KBANK_QR_TYPE_COMBO = '5'

/** sof (response): PP=Thai QR, CC=Credit Card */
export const KBANK_SOF_THAI_QR = 'PP'
export const KBANK_SOF_CREDIT_CARD = 'CC'

/** txnStatus */
export const KBANK_TXN_STATUS = {
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REQUESTED: 'REQUESTED',
  VOIDED: 'VOIDED',
} as const

const KBANK_ERROR_CODE_MESSAGES: Record<string, string> = {
  account_error: 'Cannot credit to account.',
  invalid_account: 'Account number does not exist.',
  authentication_error: 'Authentication error. Check Partner/Merchant credentials.',
  bad_request: 'Invalid request format.',
  duplicate_request: 'Duplicate request.',
  general_error: 'System cannot process this request at the moment. Please try again later.',
  internal_error: 'Internal system error.',
  invalid_request: 'Invalid request.',
  invalid_currency_code: 'Currency code is not allowed.',
  invalid_origPartnerTxnUid: 'origPartnerTxnUid does not exist.',
  invalid_txn_amount: 'Invalid transaction amount.',
  invalid_qr_type: 'QR type is not allowed.',
  qr_cancelled: 'QR is cancelled.',
  qr_paid: 'QR already paid.',
  qr_expired: 'QR has expired.',
  qr_void: 'QR void is not allowed.',
  qr_no_credit_card: 'Merchant has not registered for QR credit card.',
  qr_not_enable_credit_card: 'Merchant has not enabled QR credit card.',
  settlement_error: 'Settlement error.',
  callback_error: 'Callback error.',
  payment_exceed_limit: 'Payment exceeds limit.',
  payment_cancelled: 'Payment has been cancelled by card scheme.',
  qr_unknown: 'System cannot process this QR request at the moment.',
}

/** Generic Response Code — openapi_error hints (English, API Standards) */
const KBANK_OPENAPI_MESSAGE_HINTS: Record<string, string> = {
  'invalid request format':
    'Invalid Request Format. Check request header and body fields against the specification.',
  'oauth 2.0 token generate error':
    'OAuth 2.0 Token Generate Error. Check request header fields against the specification.',
  'invalid consumer secret':
    'Invalid Consumer Secret. Recheck connection credentials (KBANK_CONSUMER_ID / KBANK_CONSUMER_SECRET).',
  'invalid apikey for given resource':
    'Invalid ApiKey for given resource. Ensure the API key has permission to access this API.',
  'invalid api key':
    'Invalid API Key. Check connection details according to the connection documentation.',
  'invalid access token':
    'Invalid Access Token. Check Authorization Bearer header and OAuth token.',
  'access token expired': 'Access Token expired. Request a new token from the OAuth 2.0 service.',
  'invalid api call as no apiproduct match found':
    'Invalid API call as no apiproduct match found. Verify API product permissions with KBank.',
  'access token not approved': 'Access Token not approved. The access token may have been revoked.',
  'access denied':
    'Access Denied. Verify originating system information matches KBank registration (e.g. IP).',
  'invalid path': 'Invalid Path. Check endpoint URL against the specification.',
  'method is not allowed': 'method is not allowed. Check HTTP method (POST) against the specification.',
  'rate limit quota violation. quota limit exceeded. identifier : [app name & ip]':
    'Rate limit quota violation. Quota limit exceeded. Contact KBank.',
  'the rate limit is exceeded': 'The rate limit is exceeded. Contact KBank.',
  'the rate limit is exceeded by app':
    "The rate limit is exceeded By App. Transaction TPS limit exceeded. Contact KBank.",
  'unresolved variable : request.header.authorization':
    'Unresolved variable : request.header.Authorization. Authorization header is missing.',
  'source variable : request.header.authorization for basic authentication decode policy is not valid':
    'Source variable : request.header.Authorization for basic authentication decode policy is not valid.',
  'failed to resolve access token variable request.header.token':
    'Failed to resolve access token variable request.header.token. Token missing in header.',
  'threat detected':
    'Threat Detected. Request header or body does not comply with the specification.',
  'backend server error':
    'Backend Server Error. Contact KBank (apiportal_dev@kasikornbank.com).',
  'the quota limit was exceed': 'The quota limit was exceed. Contact KBank.',
  'gateway timeout': 'Gateway Timeout. Please try again later.',
}

const KBANK_HTTP_STATUS_HINTS: Record<number, string> = {
  400: 'Bad Request (400)',
  401: 'Unauthorized (401)',
  403: 'Forbidden (403)',
  404: 'Not Found (404)',
  405: 'Method Not Allowed (405)',
  429: 'Too Many Requests (429)',
  500: 'Internal Server Error (500)',
  504: 'Gateway Timeout (504)',
}

function normalizeOpenApiMessageKey(message: unknown): string {
  return String(message || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function resolveKbankOpenApiErrorMessage(openApiMessage: unknown): string {
  const raw = String(openApiMessage || '').trim()
  if (!raw) return ''
  const key = normalizeOpenApiMessageKey(raw)
  if (KBANK_OPENAPI_MESSAGE_HINTS[key]) return KBANK_OPENAPI_MESSAGE_HINTS[key]
  for (const [pattern, hint] of Object.entries(KBANK_OPENAPI_MESSAGE_HINTS)) {
    if (key.includes(pattern)) return hint
  }
  return raw
}

export function isKbankAccessTokenExpiredError(message: unknown): boolean {
  const key = normalizeOpenApiMessageKey(message)
  return key.includes('access token expired')
}

export function isKbankAccessTokenAuthError(message: unknown): boolean {
  const key = normalizeOpenApiMessageKey(message)
  return (
    isKbankAccessTokenExpiredError(message) ||
    key.includes('invalid access token') ||
    key.includes('access token not approved') ||
    key.includes('failed to resolve access token')
  )
}

export function formatKbankHttpErrorMessage(
  httpStatus: number,
  json: Record<string, unknown>,
  fallback?: string
): string {
  const openApiCode = String(json.code || '').trim().toLowerCase()
  const openApiMessage = String(json.message || '').trim()
  if (openApiCode === 'openapi_error' && openApiMessage) {
    return resolveKbankOpenApiErrorMessage(openApiMessage)
  }
  const errorDesc = String(json.errorDesc || '').trim()
  if (errorDesc) return errorDesc
  const statusMessage = String(json.statusMessage || '').trim()
  if (statusMessage) return statusMessage
  const statusHint = KBANK_HTTP_STATUS_HINTS[httpStatus]
  if (statusHint) return statusHint
  return String(fallback || '').trim() || `kbank_http_${httpStatus}`
}

export function formatKbankApiErrorMessage(
  errorCode: unknown,
  errorDesc: unknown,
  fallback?: string,
  httpContext?: { httpStatus?: number; json?: Record<string, unknown> }
): string {
  const desc = String(errorDesc || '').trim()
  if (desc) return desc

  if (httpContext?.json && (httpContext.httpStatus ?? 0) >= 400) {
    const httpMsg = formatKbankHttpErrorMessage(
      httpContext.httpStatus ?? 0,
      httpContext.json,
      ''
    )
    if (httpMsg && !httpMsg.startsWith('kbank_http_')) return httpMsg
  }

  const code = String(errorCode || '').trim()
  if (code && KBANK_ERROR_CODE_MESSAGES[code]) return KBANK_ERROR_CODE_MESSAGES[code]
  return String(fallback || '').trim() || code || 'kbank_api_error'
}

export function resolveKbankQrTypeCode(input: string | undefined): string {
  const raw = String(input || '').trim().toUpperCase()
  if (!raw || raw === 'THAI_QR' || raw === 'THQR' || raw === '3') {
    return String(process.env.KBANK_QR_TYPE_THAI || KBANK_QR_TYPE_THAI).trim() || KBANK_QR_TYPE_THAI
  }
  if (
    raw === 'CREDIT_CARD' ||
    raw === 'QRCC' ||
    raw === 'CARD' ||
    raw === '4'
  ) {
    return String(process.env.KBANK_QR_TYPE_CREDIT || KBANK_QR_TYPE_CREDIT_CARD).trim() ||
      KBANK_QR_TYPE_CREDIT_CARD
  }
  if (raw === 'THAI_QR_AND_CARD' || raw === 'COMBO' || raw === 'BOTH' || raw === '5') {
    return String(process.env.KBANK_QR_TYPE_COMBO || KBANK_QR_TYPE_COMBO).trim() || KBANK_QR_TYPE_COMBO
  }
  return raw
}

export function isKbankBusinessSuccess(statusCode: unknown): boolean {
  return String(statusCode || '').trim() === KBANK_STATUS_CODE_SUCCESS
}

/** Prefer body statusCode; on HTTP 2xx with no code, assume 00 (avoid treating http 200 as code "200"). */
export function readKbankResponseStatusCode(
  json: Record<string, unknown>,
  httpStatus: number
): string {
  const fromBody = String(json.statusCode || json.code || '').trim()
  if (fromBody) return fromBody
  if (httpStatus >= 200 && httpStatus < 300) return KBANK_STATUS_CODE_SUCCESS
  return String(httpStatus)
}

export function normalizeKbankTxnStatusToPos(
  txnStatus: unknown,
  statusCode?: unknown
): KbankPosTxnStatus {
  const code = String(statusCode || '').trim()
  if (code === KBANK_STATUS_CODE_CANCELLED) return 'declined'
  if (code === KBANK_STATUS_CODE_ERROR) return 'failed'

  const s = String(txnStatus || '').trim().toUpperCase()
  if (!s) return 'pending'
  if (s === KBANK_TXN_STATUS.PAID) return 'approved'
  if (
    s === KBANK_TXN_STATUS.VOIDED ||
    s === KBANK_TXN_STATUS.CANCELLED ||
    s === KBANK_TXN_STATUS.EXPIRED
  ) {
    return 'declined'
  }
  if (s === KBANK_TXN_STATUS.REQUESTED) return 'pending'
  if (s.includes('PAID') || s.includes('SUCCESS')) return 'approved'
  if (s.includes('VOID') || s.includes('CANCEL') || s.includes('EXPIRE') || s.includes('DECLINE')) {
    return 'declined'
  }
  if (s.includes('PENDING') || s.includes('REQUEST') || s.includes('PROCESS')) return 'pending'
  return 'failed'
}

export function resolveKbankCreditCardBrandLabels(input: {
  sof?: unknown
  cardScheme?: unknown
}): string[] {
  const out = new Set<string>()
  const scheme = String(input.cardScheme || '').trim().toUpperCase()
  if (scheme) {
    if (scheme.includes('VISA')) out.add('VISA')
    if (scheme.includes('MASTER')) out.add('MASTERCARD')
    if (scheme.includes('UNION')) out.add('UNIONPAY')
    if (scheme.includes('JCB')) out.add('JCB')
    if (out.size === 0) out.add(scheme)
  }

  const sofParts = (Array.isArray(input.sof) ? input.sof : String(input.sof || '').split(/[,|]/))
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean)
  const hasCc = sofParts.some((p) => p === KBANK_SOF_CREDIT_CARD || p.includes('CC'))
  if (hasCc && out.size === 0) {
    out.add('VISA')
    out.add('MASTERCARD')
    out.add('UNIONPAY')
  }
  return [...out]
}

export function parseKbankAllowVoid(value: unknown): boolean | null {
  const s = String(value || '').trim().toUpperCase()
  if (s === 'Y') return true
  if (s === 'N') return false
  return null
}
