import {
  extractKbankPaymentTxnNo,
  isKbankInquiryResponseApproved,
  isKbankPaymentAttemptApproved,
  isKbankPaymentTxnNo,
  isKbankQrSessionTxnNo,
  resolveKbankVoidTxnNoForRequest,
} from '@/lib/payments/kbank-api-reference'
import { extractKbankGenerateResponseInfo } from '@/lib/pos-terminal-kbank-helpers'

export type KbankVoidAttemptLike = {
  provider?: string | null
  bankId?: string | null
  txCode?: string | null
  localTxId?: string | null
  status?: string | null
  approvalCode?: string | null
  traceNo?: string | null
  terminalId?: string | null
  responseText?: string | null
  responseRaw?: string | null
  requestRaw?: string | null
  responseCode?: string | null
  approvedAmount?: number | null
}

export type KbankVoidOrderRefs = {
  partnerTxnUid: string
  txnNo: string
  terminalId: string
  alreadyVoided: boolean
}

export type KbankVoidEligibilityReason =
  | 'ok'
  | 'no_kbank_attempt'
  | 'not_paid'
  | 'already_voided'
  | 'allow_void_n'
  | 'missing_payment_txn_no'
  | 'apic_session_only'

export type KbankVoidEligibility = {
  partnerTxnUid: string
  txnNo: string
  terminalId: string
  qrType: string
  allowVoid: string
  alreadyVoided: boolean
  paid: boolean
  canVoid: boolean
  reason: KbankVoidEligibilityReason
  hasApicSessionTxnNo: boolean
}

function isKbankAttempt(a: KbankVoidAttemptLike): boolean {
  const provider = String(a.provider || '').toLowerCase()
  const bankId = String(a.bankId || '').toUpperCase()
  return provider.includes('kbank') || bankId === 'KBANK'
}

function localTxIdOf(a: KbankVoidAttemptLike): string {
  return String(a.localTxId || '').trim()
}

function isVoidAttempt(a: KbankVoidAttemptLike): boolean {
  const code = String(a.txCode || '').trim().toUpperCase()
  const id = localTxIdOf(a).toUpperCase()
  return code === 'VOID' || id.startsWith('VOD') || id.includes(':VOID')
}

function isGenerateQrAttempt(a: KbankVoidAttemptLike): boolean {
  if (!isKbankAttempt(a) || isVoidAttempt(a)) return false
  const code = String(a.txCode || '').trim().toUpperCase()
  const id = localTxIdOf(a)
  if (!id) return false
  if (/^CHK/i.test(id) || /^kbank-webhook/i.test(id)) return false
  if (['STATUS', 'INQUIRY', 'WEBHOOK'].includes(code)) return false
  return code === 'QR' || code === 'GENERATE'
}

function pickTxnNo(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const n = resolveKbankVoidTxnNoForRequest(v) || ''
    if (n) return n
  }
  return ''
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  const text = String(raw || '').trim()
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return null
}

function jsonSourcesOf(a: KbankVoidAttemptLike): Record<string, unknown>[] {
  return [a.responseRaw, a.requestRaw, a.responseText]
    .map(parseJsonObject)
    .filter((v): v is Record<string, unknown> => Boolean(v))
}

function allowVoidOf(a: KbankVoidAttemptLike): string {
  for (const json of jsonSourcesOf(a)) {
    const v = String(extractKbankGenerateResponseInfo(json).allowVoid || '').trim().toUpperCase()
    if (v === 'Y' || v === 'N') return v
  }
  const text = String(a.responseText || '')
  const m = text.match(/allowVoid["']?\s*[:=]\s*["']?([YN])/i)
  return m?.[1] ? m[1].toUpperCase() : ''
}

function qrTypeOf(a: KbankVoidAttemptLike): string {
  for (const json of jsonSourcesOf(a)) {
    const raw = String(
      json.qrType || json.qr_type || json.requestedQrType || json.displayQrType || ''
    ).trim()
    if (raw) return normalizeKbankVoidQrTypeLabel(raw)
  }
  return ''
}

export function normalizeKbankVoidQrTypeLabel(raw: unknown): string {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  if (s === '5' || s === 'QRCC' || s === 'CREDIT_CARD' || s.includes('CREDIT')) return 'CREDIT_CARD'
  if (s === '3' || s === 'THAI_QR' || s === 'PROMPTPAY' || s.includes('THAI')) return 'THAI_QR'
  return s
}

function attemptHasApic(a: KbankVoidAttemptLike): boolean {
  if (isKbankQrSessionTxnNo(a.approvalCode) || isKbankQrSessionTxnNo(a.traceNo)) return true
  for (const json of jsonSourcesOf(a)) {
    const txnNo = extractKbankPaymentTxnNo(json) || String(json.txnNo || '')
    if (isKbankQrSessionTxnNo(txnNo)) return true
    if (isKbankQrSessionTxnNo(json.txnNo)) return true
  }
  return false
}

function isPaidKbankAttempt(a: KbankVoidAttemptLike): boolean {
  if (isVoidAttempt(a)) return false
  const json = parseJsonObject(a.responseRaw) || parseJsonObject(a.responseText)
  if (json && (json.txnStatus != null || json.data != null || json.transactionStatus != null)) {
    return isKbankInquiryResponseApproved(a.status, json, a.responseCode)
  }
  const hit = {
    status: String(a.status || ''),
    responseCode: String(a.responseCode || ''),
    approvedAmount: Number(a.approvedAmount || 0),
    traceNo: String(a.traceNo || ''),
    approvalCode: String(a.approvalCode || ''),
    responseText: String(a.responseText || ''),
  }
  if (isGenerateQrAttempt(a)) {
    const paymentTxnNo =
      resolveKbankVoidTxnNoForRequest(a.approvalCode) || resolveKbankVoidTxnNoForRequest(a.traceNo) || ''
    return Boolean(paymentTxnNo) && isKbankPaymentAttemptApproved(hit)
  }
  return isKbankPaymentAttemptApproved(hit)
}

function emptyEligibility(
  reason: KbankVoidEligibilityReason,
  extra?: Partial<KbankVoidEligibility>
): KbankVoidEligibility {
  return {
    partnerTxnUid: '',
    txnNo: '',
    terminalId: '',
    qrType: '',
    allowVoid: '',
    alreadyVoided: false,
    paid: false,
    canVoid: false,
    reason,
    hasApicSessionTxnNo: false,
    ...extra,
  }
}

/** Resolve KBank Void eligibility from payment-attempt rows of one POS order. */
export function evaluateKbankVoidEligibilityFromAttempts(
  attempts: KbankVoidAttemptLike[] | null | undefined
): KbankVoidEligibility {
  const rows = (attempts || []).filter(isKbankAttempt)
  if (rows.length === 0) return emptyEligibility('no_kbank_attempt')

  const alreadyVoided = rows.some(
    (a) => isVoidAttempt(a) && String(a.status || '').trim().toLowerCase() === 'approved'
  )
  const generates = rows.filter(isGenerateQrAttempt)
  const approvedGenerate = generates.find(
    (a) => String(a.status || '').trim().toLowerCase() === 'approved'
  )
  const generate = approvedGenerate || generates[0]
  const partnerTxnUid = localTxIdOf(generate || {})
  const hasApicSessionTxnNo = rows.some(attemptHasApic)

  const txnNo = pickTxnNo(
    generate?.approvalCode,
    generate?.traceNo,
    ...rows.flatMap((a) => [a.approvalCode, a.traceNo, extractKbankPaymentTxnNo(parseJsonObject(a.responseRaw))])
  )
  const terminalId = String(
    generate?.terminalId || rows.find((a) => String(a.terminalId || '').trim())?.terminalId || ''
  ).trim()

  let allowVoid = ''
  for (const a of [generate, ...rows].filter(Boolean) as KbankVoidAttemptLike[]) {
    const v = allowVoidOf(a)
    if (v === 'N') {
      allowVoid = 'N'
      break
    }
    if (v === 'Y' && allowVoid !== 'N') allowVoid = 'Y'
  }

  let qrType = ''
  for (const a of [generate, ...rows].filter(Boolean) as KbankVoidAttemptLike[]) {
    qrType = qrTypeOf(a)
    if (qrType) break
  }

  const paid = rows.some(isPaidKbankAttempt)

  const base: KbankVoidEligibility = {
    partnerTxnUid,
    txnNo,
    terminalId,
    qrType: qrType || 'THAI_QR',
    allowVoid,
    alreadyVoided,
    paid,
    canVoid: false,
    reason: 'no_kbank_attempt',
    hasApicSessionTxnNo,
  }

  if (!partnerTxnUid && !alreadyVoided) {
    return emptyEligibility('no_kbank_attempt', { hasApicSessionTxnNo, alreadyVoided })
  }
  if (alreadyVoided) {
    return { ...base, canVoid: false, reason: 'already_voided' }
  }
  if (!paid) {
    return { ...base, canVoid: false, reason: 'not_paid' }
  }
  if (allowVoid === 'N') {
    return { ...base, canVoid: false, reason: 'allow_void_n' }
  }
  if (!txnNo) {
    return {
      ...base,
      canVoid: false,
      reason: hasApicSessionTxnNo ? 'apic_session_only' : 'missing_payment_txn_no',
    }
  }
  if (!isKbankPaymentTxnNo(txnNo)) {
    return {
      ...base,
      txnNo: '',
      canVoid: false,
      reason: isKbankQrSessionTxnNo(txnNo) || hasApicSessionTxnNo ? 'apic_session_only' : 'missing_payment_txn_no',
    }
  }
  return { ...base, canVoid: true, reason: 'ok' }
}

/** Resolve KBank Void ids from payment-attempt rows of one POS order. */
export function pickKbankVoidRefsFromAttempts(
  attempts: KbankVoidAttemptLike[] | null | undefined
): KbankVoidOrderRefs | null {
  const el = evaluateKbankVoidEligibilityFromAttempts(attempts)
  if (el.reason === 'no_kbank_attempt' && !el.alreadyVoided) return null
  if (!el.partnerTxnUid && !el.alreadyVoided) return null
  return {
    partnerTxnUid: el.partnerTxnUid,
    txnNo: el.txnNo,
    terminalId: el.terminalId,
    alreadyVoided: el.alreadyVoided,
  }
}

export function needsKbankVoidInquiry(el: KbankVoidEligibility): boolean {
  if (!el.partnerTxnUid || el.alreadyVoided || el.canVoid) return false
  if (el.reason === 'allow_void_n' || el.reason === 'no_kbank_attempt') return false
  return (
    !el.txnNo ||
    el.reason === 'not_paid' ||
    el.reason === 'apic_session_only' ||
    el.reason === 'missing_payment_txn_no'
  )
}

export function kbankVoidReasonToStatusCode(reason: KbankVoidEligibilityReason): string {
  switch (reason) {
    case 'already_voided':
      return 'KBANK_VOID_ALREADY'
    case 'allow_void_n':
      return 'KBANK_VOID_NOT_ALLOWED'
    case 'not_paid':
      return 'KBANK_VOID_NOT_PAID'
    case 'apic_session_only':
    case 'missing_payment_txn_no':
      return 'KBANK_VOID_NO_PAYMENT_TXN_NO'
    case 'no_kbank_attempt':
      return 'KBANK_VOID_NO_ATTEMPT'
    default:
      return 'KBANK_VOID_OK'
  }
}
