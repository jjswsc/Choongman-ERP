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
  /** KBank API — credit card QR product not enabled for merchant */
  EMQRNCC: 'Merchant has not registered for QR credit card.',
  EMQRNECC: 'Merchant has not enabled QR credit card.',
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

/** After rate-limit response, pause client-side KBank follow-up calls (ms). */
export const KBANK_RATE_LIMIT_BACKOFF_MS = 300_000

/**
 * Anti double-tap only (same cashier rapid re-click).
 * Do NOT use a long gap here — busy stores need back-to-back customer QR payments.
 */
export const KBANK_GENERATE_MIN_INTERVAL_MS = 2_000

/** Refresh access token this many ms before bank expires_in elapses. */
export const KBANK_TOKEN_EXPIRY_SKEW_MS = 30_000

/** Stop QR inquiry/callback polls after this age even if still waiting. */
export const KBANK_QR_SESSION_MAX_MS = 10 * 60 * 1000

/** Thai QR auto-Inquiry on POS — only while QR is on screen. Staff can still tap Inquiry immediately. */
export const KBANK_THAI_QR_INQUIRY_POLL_FIRST_MS = 3_000
/** After the first check, space out bank Inquiry to cut Fluid CPU (was 5s). */
export const KBANK_THAI_QR_INQUIRY_POLL_INTERVAL_MS = 12_000
export const KBANK_THAI_QR_INQUIRY_COOLDOWN_MS = 3_000

/** sessionStorage key — survives modal remount within the same tab */
export const KBANK_API_PAUSE_STORAGE_KEY = 'cm_kbank_api_paused_until_ms'

/** KBank Open API rate-limit / quota exceeded (English message from bank). */
export function isKbankRateLimitError(message: unknown): boolean {
  const key = String(message || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return (
    key.includes('rate limit') ||
    key.includes('quota violation') ||
    key.includes('quota limit exceeded') ||
    key.includes('the rate limit is exceeded')
  )
}

/** Our fetch abort / bank-proxy hang (not a KBank business statusCode). */
export function isKbankTimeoutError(statusCode?: unknown, message?: unknown): boolean {
  const code = String(statusCode || '').trim().toUpperCase()
  if (code === 'TIMEOUT' || code === 'ABORT_ERR') return true
  const key = String(message || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return (
    key.includes('timed out') ||
    key.includes('this operation was aborted') ||
    key === 'aborterror' ||
    key.includes('the operation was aborted')
  )
}

/** Node fetch AbortError / DOMException from AbortController.abort(). */
export function isKbankFetchAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = String((err as { name?: unknown }).name || '')
  const code = (err as { code?: unknown }).code
  return name === 'AbortError' || code === 20 || code === 'ABORT_ERR'
}

/** Credit Card QR 미등록·미사용(EMQRNCC 등) — Thai QR로 안내 가능 */
export function isKbankCreditCardQrUnavailableError(
  errorCode: unknown,
  errorDesc?: unknown
): boolean {
  const code = String(errorCode || '').trim().toUpperCase()
  if (code === 'EMQRNCC' || code === 'EMQRNECC' || code === 'QR_NO_CREDIT_CARD' || code === 'QR_NOT_ENABLE_CREDIT_CARD') {
    return true
  }
  const blob = `${String(errorDesc || '')} ${String(errorCode || '')}`.toUpperCase()
  return blob.includes('EMQRNCC') || blob.includes('EMQRNECC') || blob.includes('NOT REGISTERED FOR QR CREDIT')
}

export function formatKbankApiErrorMessage(
  errorCode: unknown,
  errorDesc: unknown,
  fallback?: string,
  httpContext?: { httpStatus?: number; json?: Record<string, unknown> }
): string {
  const code = String(errorCode || '').trim()
  if (code && KBANK_ERROR_CODE_MESSAGES[code]) return KBANK_ERROR_CODE_MESSAGES[code]
  const desc = String(errorDesc || '').trim()
  const parenCode = /\(([A-Z0-9_]+)\)\s*$/.exec(desc)?.[1]
  if (parenCode && KBANK_ERROR_CODE_MESSAGES[parenCode]) return KBANK_ERROR_CODE_MESSAGES[parenCode]
  if (desc) return desc

  if (httpContext?.json && (httpContext.httpStatus ?? 0) >= 400) {
    const httpMsg = formatKbankHttpErrorMessage(
      httpContext.httpStatus ?? 0,
      httpContext.json,
      ''
    )
    if (httpMsg && !httpMsg.startsWith('kbank_http_')) return httpMsg
  }

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

/**
 * Drop client/UI fields that must not reach Void/Cancel bank bodies.
 * Example: qrType "THAI_QR" (bank expects "3" or omit) causes Invalid Request Format.
 */
export function stripDisallowedKbankActionPayloadFields(
  payload: Record<string, unknown>,
  options?: { includeQrType?: boolean; includeTxnNo?: boolean }
): Record<string, unknown> {
  const out = { ...payload }
  if (!options?.includeQrType) delete out.qrType
  if (!options?.includeTxnNo) delete out.txnNo
  delete out.partnerId
  delete out.partnerSecret
  delete out.merchantId
  return out
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

/** Generate QR session id (e.g. APIC…) — not valid for Credit Card Inquiry/Void after PAID. */
export function isKbankQrSessionTxnNo(txnNo: unknown): boolean {
  const s = String(txnNo || '').trim().toUpperCase()
  return /^APIC/i.test(s)
}

export function isKbankCreditCardQrTypeLabel(qrType: unknown): boolean {
  const s = String(qrType || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  return s === 'CREDIT_CARD' || s === 'QRCC' || s === '4' || s === '5' || s.includes('CREDIT')
}

/** Bank payment txnNo for Inquiry/Void (e.g. 26440008). Stored columns are 20 chars. */
export function isKbankPaymentTxnNo(txnNo: unknown): boolean {
  const s = String(txnNo || '').trim()
  return /^\d{6,20}$/.test(s)
}

function asKbankPlainObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function parseKbankJsonObject(raw: unknown): Record<string, unknown> | null {
  const direct = asKbankPlainObject(raw)
  if (direct) return direct
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null
  try {
    return asKbankPlainObject(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

const KBANK_TXN_NO_KEYS = [
  'txnNo',
  'txn_no',
  'transactionNo',
  'transaction_no',
  'bankTxnNo',
  'bank_txn_no',
  'paymentTxnNo',
  'payment_txn_no',
  'kbankTxnNo',
  'approvalTxnNo',
  'authCode',
  'auth_code',
  'approvalCode',
  'approval_code',
  'txnRef',
  'txn_ref',
  'paymentRef',
  'payment_ref',
  'invoiceNo',
  'invoice_no',
  'referenceNo',
  'reference_no',
  'retrieveRefNo',
  'retrievalRefNo',
  'retrievalReferenceNo',
] as const

function pickKbankTxnNoFromObject(obj: Record<string, unknown> | null, depth = 0): string[] {
  if (!obj || depth > 5) return []
  const out: string[] = []
  for (const key of KBANK_TXN_NO_KEYS) {
    const v = obj[key]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
      const s = String(v).trim()
      if (s) out.push(s)
    }
  }
  for (const nestedKey of ['data', 'result', 'payment', 'paymentInfo']) {
    const nested = parseKbankJsonObject(obj[nestedKey])
    if (nested) out.push(...pickKbankTxnNoFromObject(nested, depth + 1))
  }
  return out
}

/** Collect txnNo candidates from API/callback JSON; prefer numeric payment txnNo. */
export function extractKbankPaymentTxnNo(raw: unknown): string {
  const root = parseKbankJsonObject(raw)
  if (!root) return ''
  const candidates = pickKbankTxnNoFromObject(root)
  const payment = candidates.filter((c) => isKbankPaymentTxnNo(c))
  if (payment.length > 0) return payment[0]
  const nonSession = candidates.filter((c) => !isKbankQrSessionTxnNo(c))
  return nonSession[0] || ''
}

export function extractKbankQrSessionTxnNo(raw: unknown): string {
  const root = parseKbankJsonObject(raw)
  if (!root) {
    const direct = String(raw || '').trim()
    return isKbankQrSessionTxnNo(direct) ? direct : ''
  }
  const candidates = pickKbankTxnNoFromObject(root)
  return candidates.find((c) => isKbankQrSessionTxnNo(c)) || ''
}

/** Alert text when Void cannot resolve numeric payment txnNo after Inquiry. */
export function formatKbankVoidInquiryFailureMessage(params: {
  fallback: string
  inquiry?: {
    success?: boolean
    status?: string | null
    statusCode?: string | null
    statusMessage?: string | null
    message?: string | null
    data?: unknown
  } | null
}): string {
  const lines: string[] = [String(params.fallback || '').trim() || 'Could not obtain txnNo from Inquiry.']
  const inq = params.inquiry
  if (!inq) return lines.join('\n')

  const detailBits = [
    inq.statusCode != null && String(inq.statusCode).trim()
      ? `statusCode=${String(inq.statusCode).trim()}`
      : '',
    inq.status != null && String(inq.status).trim() ? `status=${String(inq.status).trim()}` : '',
    String(inq.statusMessage || inq.message || '').trim(),
  ].filter(Boolean)
  if (detailBits.length) lines.push(detailBits.join(' · '))

  const root = parseKbankJsonObject(inq.data) || asKbankPlainObject(inq)
  const candidates = root ? [...new Set(pickKbankTxnNoFromObject(root))].slice(0, 5) : []
  if (candidates.length > 0) {
    lines.push(`bank txnNo: ${candidates.join(', ')}`)
    if (!candidates.some((c) => isKbankPaymentTxnNo(c))) {
      lines.push('(Void needs numeric payment txnNo e.g. 26440008 — APIC… is QR session id only)')
    }
  }

  try {
    const raw = JSON.stringify(inq.data != null ? inq.data : { statusCode: inq.statusCode, status: inq.status })
    if (raw && raw !== '{}' && raw !== 'null') {
      lines.push(raw.length > 400 ? `${raw.slice(0, 400)}…` : raw)
    }
  } catch {
    /* ignore */
  }
  return lines.join('\n')
}

/**
 * txnNo to send on Inquiry — omit Generate session ids (APIC*).
 * Credit Card: only numeric payment txnNo (from callback or successful inquiry).
 */
export function resolveKbankInquiryTxnNoForRequest(
  txnNo: unknown,
  options?: { qrType?: string }
): string | undefined {
  const t = String(txnNo || '').trim()
  if (!t) return undefined
  if (isKbankQrSessionTxnNo(t)) return undefined
  const qr = String(options?.qrType || '')
    .trim()
    .toUpperCase()
  if (qr === 'CREDIT_CARD' && !isKbankPaymentTxnNo(t)) return undefined
  return t
}

/** txnNo for Void. Credit Card needs numeric payment txnNo; Thai QR / PromptPay keeps APIC after PAID. */
export function resolveKbankVoidTxnNoForRequest(
  txnNo: unknown,
  options?: { qrType?: string }
): string | undefined {
  const t = String(txnNo || '').trim()
  if (!t) return undefined
  if (isKbankPaymentTxnNo(t)) return t
  if (isKbankQrSessionTxnNo(t) && !isKbankCreditCardQrTypeLabel(options?.qrType)) return t
  return undefined
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

/** Inquiry/check-status API 응답에서 승인 여부 (top-level status + nested data.txnStatus). */
export function isKbankInquiryResponseApproved(
  status: unknown,
  data?: Record<string, unknown> | null,
  statusCode?: unknown
): boolean {
  const top = String(status || '').trim().toLowerCase()
  if (top === 'approved') return true
  const sources = collectKbankNestedSources(data)
  if (sources.length === 0) return false
  for (const src of sources) {
    const nested = normalizeKbankTxnStatusToPos(
      src.txnStatus ?? src.transactionStatus ?? src.status ?? src.paymentStatus,
      statusCode ?? src.statusCode ?? data?.statusCode
    )
    if (nested === 'approved') return true
  }
  return false
}

/** pos_payment_attempts / 콜백 폴링 — CC 포함 승인 추론 (status=pending 이어도 trace·금액으로 판단). */
export function isKbankPaymentAttemptApproved(hit: {
  status?: string
  responseCode?: string
  approvedAmount?: number
  traceNo?: string
  approvalCode?: string
  responseText?: string
}): boolean {
  const status = String(hit.status || '').trim().toLowerCase()
  if (status === 'approved') return true
  const approvedAmount = Math.max(0, Number(hit.approvedAmount || 0))
  const responseCode = String(hit.responseCode || '').trim()
  const traceNo = String(hit.traceNo || '').trim()
  const approvalCode = String(hit.approvalCode || '').trim()
  const paymentTxnNo = isKbankPaymentTxnNo(traceNo)
    ? traceNo
    : isKbankPaymentTxnNo(approvalCode)
      ? approvalCode
      : ''
  if (approvedAmount > 0.0001 && (responseCode === KBANK_STATUS_CODE_SUCCESS || paymentTxnNo)) {
    return true
  }
  const lowerText = String(hit.responseText || '').trim().toLowerCase()
  if (paymentTxnNo && (lowerText.includes('paid') || lowerText.includes('success'))) {
    return true
  }
  return false
}

/** Webhook: CC 콜백이 statusCode 00 + txnNo + amount 만 보내는 경우 승인 처리. */
export function normalizeKbankWebhookPaymentStatus(
  txnStatus: unknown,
  statusCode: unknown,
  amount: number,
  paymentTxnNo: string
): KbankPosTxnStatus {
  const normalized = normalizeKbankTxnStatusToPos(txnStatus, statusCode)
  if (
    normalized === 'pending' &&
    String(statusCode || '').trim() === KBANK_STATUS_CODE_SUCCESS &&
    amount > 0 &&
    isKbankPaymentTxnNo(paymentTxnNo)
  ) {
    return 'approved'
  }
  return normalized
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

export type KbankDisplayQrType = 'THAI_QR' | 'CREDIT_CARD'

function collectKbankNestedSources(raw: unknown): Record<string, unknown>[] {
  const root = asKbankPlainObject(raw)
  if (!root) return []
  const sources = [root]
  for (const nestedKey of ['data', 'result', 'payment', 'paymentInfo']) {
    const nested = asKbankPlainObject(root[nestedKey])
    if (nested) sources.push(nested)
  }
  return sources
}

function pickKbankPrimitiveField(sources: Record<string, unknown>[], keys: string[]): string {
  for (const src of sources) {
    for (const key of keys) {
      const v = src[key]
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
        const s = String(v).trim()
        if (s) return s
      }
    }
  }
  return ''
}

/** qrType / sof / cardScheme from Generate or Inquiry response (nested data.*). */
export function extractKbankQrResponseMeta(raw: unknown): {
  qrTypeCode: string
  sof: string
  cardScheme: string
} {
  const sources = collectKbankNestedSources(raw)
  return {
    qrTypeCode: pickKbankPrimitiveField(sources, ['qrType', 'qr_type']),
    sof: pickKbankPrimitiveField(sources, ['sof']),
    cardScheme: pickKbankPrimitiveField(sources, ['cardScheme', 'card_scheme']),
  }
}

/** UI display type from bank fields; falls back to requested when bank omits qrType. */
export function resolveKbankDisplayQrTypeFromResponse(input: {
  qrType?: unknown
  sof?: unknown
  requested?: KbankDisplayQrType
  emvPayload?: unknown
}): KbankDisplayQrType {
  return resolveKbankDisplayQrTypeDetails(input).displayType
}

export type KbankDisplayQrTypeSource = 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested'

export function inferKbankQrTypeFromEmvPayload(payload: unknown): KbankDisplayQrType | null {
  const raw = String(payload || '').trim()
  if (!raw.startsWith('000201')) return null
  // Thai QR / PromptPay AID (BOT standard)
  if (/A0000006770101/i.test(raw)) return 'THAI_QR'
  return null
}

export function resolveKbankDisplayQrTypeDetails(input: {
  qrType?: unknown
  sof?: unknown
  requested?: KbankDisplayQrType
  emvPayload?: unknown
}): {
  displayType: KbankDisplayQrType
  source: KbankDisplayQrTypeSource
  bankQrTypeCode: string
  bankSof: string
} {
  const bankQrTypeCode = String(input.qrType ?? '').trim()
  const bankSof = String(input.sof ?? '').trim()
  const rawType = bankQrTypeCode.toUpperCase()
  if (
    rawType === KBANK_QR_TYPE_CREDIT_CARD ||
    rawType === '4' ||
    rawType === 'CREDIT_CARD' ||
    rawType === 'QRCC' ||
    rawType === 'CARD'
  ) {
    return { displayType: 'CREDIT_CARD', source: 'bank_qr_type', bankQrTypeCode, bankSof }
  }
  if (
    rawType === KBANK_QR_TYPE_THAI ||
    rawType === '3' ||
    rawType === 'THAI_QR' ||
    rawType === 'THQR' ||
    rawType === 'THAI'
  ) {
    return { displayType: 'THAI_QR', source: 'bank_qr_type', bankQrTypeCode, bankSof }
  }
  if (
    rawType === KBANK_QR_TYPE_COMBO ||
    rawType === '5' ||
    rawType === 'THAI_QR_AND_CARD' ||
    rawType === 'COMBO' ||
    rawType === 'BOTH'
  ) {
    return { displayType: 'THAI_QR', source: 'bank_qr_type', bankQrTypeCode, bankSof }
  }

  const sofParts = (Array.isArray(input.sof) ? input.sof : String(input.sof ?? '').split(/[,|]/))
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean)
  if (sofParts.some((p) => p === KBANK_SOF_CREDIT_CARD || p === 'CC' || p.includes('CREDIT'))) {
    return { displayType: 'CREDIT_CARD', source: 'bank_sof', bankQrTypeCode, bankSof }
  }
  if (sofParts.some((p) => p === KBANK_SOF_THAI_QR || p === 'PP' || p.includes('PROMPT'))) {
    return { displayType: 'THAI_QR', source: 'bank_sof', bankQrTypeCode, bankSof }
  }

  const emvInferred = inferKbankQrTypeFromEmvPayload(input.emvPayload)
  if (emvInferred) {
    return { displayType: emvInferred, source: 'emv_payload', bankQrTypeCode, bankSof }
  }

  return {
    displayType: input.requested === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR',
    source: 'requested',
    bankQrTypeCode,
    bankSof,
  }
}

const KBANK_LOG_SENSITIVE_KEY =
  /secret|password|authorization|access_token|access-token|consumer_secret|api_?key/i
const KBANK_LOG_QR_PAYLOAD_KEY =
  /^(qrpayload|qrcode|qrstring|qrdata|qrrawdata|qrraw|thaiqr|payload)$/i

function maskKbankQrPayloadValue(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length <= 24) return `[qr:${raw.length}chars]`
  return `[qr:${raw.length}chars,head:${raw.slice(0, 16)}…]`
}

/** Mask secrets and truncate QR strings for Vercel logs / KBank support paste. */
export function maskKbankMessageForLog(input: unknown): unknown {
  if (input == null) return input
  if (Array.isArray(input)) return input.map((item) => maskKbankMessageForLog(item))
  if (typeof input !== 'object') return input

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (KBANK_LOG_SENSITIVE_KEY.test(key)) {
      out[key] = '***'
      continue
    }
    if (typeof value === 'string' && KBANK_LOG_QR_PAYLOAD_KEY.test(key)) {
      out[key] = maskKbankQrPayloadValue(value)
      continue
    }
    out[key] = maskKbankMessageForLog(value)
  }
  return out
}
