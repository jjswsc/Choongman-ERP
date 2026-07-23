/**
 * POS 결제 게이트웨이 (Linkpos·KBank) — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { isLinkposCardApiEnabled } from '../linkpos-card-api-enabled'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'

export type LinkposPaymentSummary = {
  provider: 'kbtg_linkpos'
  mode: 'hypercom'
  txCode: '20' | '26' | '50' | '70'
  bankId: string
  responseCode: string
  approvalCode?: string
  traceNo?: string
  refNo?: string
  terminalId?: string
  merchantId?: string
  reference1: string
  requestedAmount: number
  approvedAmount: number
  requestedAt: string
  respondedAt: string
}

export type KbankQrGenerateResult = {
  success: boolean
  partnerTransactionId?: string
  statusCode?: string | null
  statusMessage?: string | null
  requestedQrType?: string | null
  sentQrTypeCode?: string | null
  bankQrTypeCode?: string | null
  bankSof?: string | null
  displayQrType?: 'THAI_QR' | 'CREDIT_CARD' | null
  displayQrTypeSource?: 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested' | null
  qrTypeMismatch?: boolean
  terminalIdIncluded?: boolean
  requestMessage?: Record<string, unknown> | null
  responseMessage?: unknown
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrCheckStatusResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  status?: string | null
  data?: Record<string, unknown>
  message?: string
}

export type KbankQrActionResult = {
  success: boolean
  partnerTransactionId?: string | null
  originalTransactionId?: string | null
  refId?: string | null
  statusCode?: string | null
  statusMessage?: string | null
  data?: Record<string, unknown>
  message?: string
}

const LOCAL_LINKPOS_TX_ENDPOINTS = [
  'http://127.0.0.1:18181/linkpos/transaction',
  'http://localhost:18181/linkpos/transaction',
  'http://127.0.0.1:17888/linkpos/transaction',
  'http://localhost:17888/linkpos/transaction',
]

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(800, timeoutMs))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) return { ok: false, error: String(data?.message || `HTTP ${res.status}`) }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

/** Windows POS IPC → 메인 프로세스 브리지 (HTTPS→localhost 혼합콘텐츠 회피) */
async function postLinkposViaHybridShell(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const shell = typeof window !== 'undefined' ? window.cmPosShell : undefined
  if (!shell || typeof shell.linkposTransaction !== 'function') {
    return { ok: false, error: 'no_hybrid_shell' }
  }
  try {
    const result = (await Promise.race([
      shell.linkposTransaction(body),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('linkpos_ipc_timeout')), Math.max(3000, timeoutMs))
      ),
    ])) as Record<string, unknown>
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function probeLinkposLocalReady(): Promise<boolean> {
  const shell = typeof window !== 'undefined' ? window.cmPosShell : undefined
  if (shell && typeof shell.linkposHealth === 'function') {
    try {
      const st = await shell.linkposHealth()
      return Boolean(st && (st as { serialReady?: boolean }).serialReady)
    } catch {
      /* fall through */
    }
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 800)
    const health = await fetch('http://127.0.0.1:18181/health', {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(timer))
    if (!health.ok) return false
    const j = (await health.json().catch(() => null)) as { serialReady?: boolean } | null
    return Boolean(j?.serialReady)
  } catch {
    return false
  }
}

export async function executeLinkposPayment(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: false as const,
      message: 'linkpos_card_api_disabled',
      payment: null as LinkposPaymentSummary | null,
      source: 'disabled' as const,
    }
  }

  const timeoutMs = Math.max(2000, Number(params.timeoutMs ?? 120000))
  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    protocol: 'hypercom_v2',
  }

  // Hybrid #0: Electron IPC (권장)
  {
    const r = await postLinkposViaHybridShell(payload, timeoutMs)
    if (r.ok && r.data) {
      if (r.data.success) {
        return {
          success: true,
          payment: (r.data.payment || null) as LinkposPaymentSummary | null,
          source: 'local' as const,
        }
      }
      return {
        success: false,
        message: String(r.data.error || r.data.message || 'declined'),
        source: 'local' as const,
      }
    }
  }

  // Hybrid #1: POS 로컬 HTTP 브리지
  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) {
      return {
        success: true,
        payment: (r.data.payment || null) as LinkposPaymentSummary | null,
        source: 'local' as const,
      }
    }
    return {
      success: false,
      message: String(r.data?.error || r.data?.message || 'declined'),
      source: 'local' as const,
    }
  }

  // Hybrid #2: 서버 중계 fallback
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

/**
 * LinkPOS native QR (Hypercom tx 70) — EDC가 금액 받아 단말 QR 표시·승인.
 * KBank Partner API 문자열을 단말에 “그려 넣는” display_qr 과 다름 (펌웨어 미지원인 경우 많음).
 */
export async function executeLinkposQrPayment(params: {
  amount: number
  bankId?: string
  /** LinkPOS A1 — 보통 03=Thai QR/PromptPay */
  paymentIndicator?: string
  reference1?: string
  reference2?: string
  storeCode?: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: false as const,
      message: 'linkpos_card_api_disabled',
      payment: null as LinkposPaymentSummary | null,
      source: 'disabled' as const,
    }
  }

  const timeoutMs = Math.max(2000, Number(params.timeoutMs ?? 120000))
  const a1 = String(params.paymentIndicator || '03').replace(/\D/g, '').padStart(2, '0').slice(-2) || '03'
  const payload = {
    action: 'qr',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    paymentIndicator: a1,
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    protocol: 'hypercom_v2',
    timeoutMs,
  }

  const viaShell = await postLinkposViaHybridShell(payload, timeoutMs)
  if (viaShell.ok && viaShell.data) {
    if (viaShell.data.success) {
      return {
        success: true,
        payment: normalizeLinkposQrPaymentSummary(viaShell.data, params),
        source: 'local' as const,
      }
    }
    return {
      success: false,
      message: String(viaShell.data.error || viaShell.data.message || 'declined'),
      payment: null as LinkposPaymentSummary | null,
      source: 'local' as const,
    }
  }

  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) {
      return {
        success: true,
        payment: normalizeLinkposQrPaymentSummary(r.data, params),
        source: 'local' as const,
      }
    }
    return {
      success: false,
      message: String(r.data?.error || r.data?.message || 'declined'),
      payment: null as LinkposPaymentSummary | null,
      source: 'local' as const,
    }
  }

  return {
    success: false,
    message: 'linkpos_qr_bridge_unreachable',
    payment: null as LinkposPaymentSummary | null,
    source: 'local' as const,
  }
}

function normalizeLinkposQrPaymentSummary(
  data: Record<string, unknown>,
  params: { amount: number; bankId?: string; reference1?: string }
): LinkposPaymentSummary | null {
  const nested = (data.payment && typeof data.payment === 'object' ? data.payment : null) as Record<
    string,
    unknown
  > | null
  // bridge가 payment 없이 top-level 필드를 주는 경우도 허용
  const p = nested || (data.responseCode != null || data.approvalCode != null ? data : null)
  if (!p) return null
  const responseCode = String(p.responseCode ?? '').trim()
  if (!responseCode || responseCode === 'ND') return null
  const approvedRaw = Number(p.approvedAmount ?? p.amount ?? params.amount)
  const approvedAmount =
    Number.isFinite(approvedRaw) && approvedRaw > 0.005 ? approvedRaw : Number(params.amount)
  const now = new Date().toISOString()
  return {
    provider: 'kbtg_linkpos',
    mode: 'hypercom',
    txCode: '70',
    bankId: String(params.bankId || ''),
    responseCode,
    approvalCode: p.approvalCode != null ? String(p.approvalCode) : undefined,
    traceNo: p.traceNo != null ? String(p.traceNo) : undefined,
    refNo: p.refNo != null ? String(p.refNo) : undefined,
    terminalId: p.terminalId != null ? String(p.terminalId) : undefined,
    merchantId: p.merchantId != null ? String(p.merchantId) : undefined,
    reference1: String(params.reference1 || ''),
    requestedAmount: Number(params.amount),
    approvedAmount,
    requestedAt: now,
    respondedAt: now,
  }
}

async function executeLinkposTransactionAction(
  action: 'display_qr' | 'clear_qr',
  fields: Record<string, unknown>,
  timeoutMs: number
): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  if (!isLinkposCardApiEnabled()) {
    return { success: false, message: 'linkpos_card_api_disabled' }
  }
  const payload = { action, protocol: 'hypercom_v2', ...fields }

  const viaShell = await postLinkposViaHybridShell(payload, timeoutMs)
  if (viaShell.ok && viaShell.data) {
    if (viaShell.data.success) return { success: true, source: 'local' as const }
    return {
      success: false,
      source: 'local' as const,
      message: String(viaShell.data.error || viaShell.data.message || 'linkpos_action_failed'),
    }
  }

  for (const endpoint of LOCAL_LINKPOS_TX_ENDPOINTS) {
    const r = await postJsonWithTimeout(endpoint, payload, timeoutMs)
    if (!r.ok) continue
    if (r.data?.success) return { success: true, source: 'local' as const }
    return {
      success: false,
      source: 'local' as const,
      message: String(r.data?.error || r.data?.message || 'linkpos_action_failed'),
    }
  }
  return {
    success: false,
    message:
      action === 'display_qr' ? 'linkpos_display_qr_not_supported' : 'linkpos_clear_qr_not_supported',
  }
}

export async function executeLinkposDisplayQr(params: {
  qrPayload: string
  amount?: number
  reference1?: string
  reference2?: string
  storeCode?: string
  timeoutMs?: number
}): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  const qrPayload = String(params.qrPayload || '').trim()
  if (!qrPayload) return { success: false, message: 'qr_payload_required' }
  // EDC 표시는 단말 응답이 늦을 수 있음
  const timeoutMs = Math.max(3000, Number(params.timeoutMs ?? 15000))
  return executeLinkposTransactionAction(
    'display_qr',
    {
      qrPayload,
      amount: Number(params.amount ?? 0),
      reference1: String(params.reference1 || '').slice(0, 20),
      reference2: String(params.reference2 || '').slice(0, 20),
      storeCode: String(params.storeCode || ''),
    },
    timeoutMs
  )
}

/** EDC/LinkPOS QR 화면 해제 — 결제 완료·취소·세션 정리 시 호출 */
export async function executeLinkposClearQr(params?: {
  storeCode?: string
  timeoutMs?: number
}): Promise<{ success: boolean; source?: 'local'; message?: string }> {
  const timeoutMs = Math.max(800, Number(params?.timeoutMs ?? 1500))
  return executeLinkposTransactionAction(
    'clear_qr',
    { storeCode: String(params?.storeCode || '') },
    timeoutMs
  )
}

export async function executeKbankGenerateQr(params: {
  amount: number
  qrType?: string
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  reference1?: string
  reference2?: string
  reference3?: string
  reference4?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrGenerateResult> {
  const terminalId = String(params.terminalId || '').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
  }
  const res = await apiFetch('/api/pos/kbank/generate-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const meta = {
    requestedQrType: data.requestedQrType != null ? String(data.requestedQrType) : null,
    sentQrTypeCode: data.sentQrTypeCode != null ? String(data.sentQrTypeCode) : null,
    bankQrTypeCode: data.bankQrTypeCode != null ? String(data.bankQrTypeCode) : null,
    bankSof: data.bankSof != null ? String(data.bankSof) : null,
    displayQrType:
      data.displayQrType === 'CREDIT_CARD' || data.displayQrType === 'THAI_QR'
        ? (data.displayQrType as 'THAI_QR' | 'CREDIT_CARD')
        : null,
    displayQrTypeSource:
      data.displayQrTypeSource === 'bank_qr_type' ||
      data.displayQrTypeSource === 'bank_sof' ||
      data.displayQrTypeSource === 'emv_payload' ||
      data.displayQrTypeSource === 'requested'
        ? (data.displayQrTypeSource as 'bank_qr_type' | 'bank_sof' | 'emv_payload' | 'requested')
        : null,
    qrTypeMismatch: data.qrTypeMismatch === true,
    terminalIdIncluded: data.terminalIdIncluded === true,
    requestMessage:
      data.requestMessage && typeof data.requestMessage === 'object'
        ? (data.requestMessage as Record<string, unknown>)
        : null,
    responseMessage: data.responseMessage ?? null,
  }
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
      ...meta,
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
    ...meta,
  }
}

export async function executeKbankCheckStatus(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrCheckStatusResult> {
  const res = await apiFetch('/api/pos/kbank/check-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      status: String(data.status || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    status: String(data.status || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankCancelQr(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/cancel-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankVoidPayment(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const txnNo = String(params.txnNo || '').trim()
  const origPartnerTxnUid = String(
    params.origPartnerTxnUid || params.originalTransactionId || params.partnerTransactionId || ''
  ).trim()
  const payload = {
    ...(params.payload || {}),
    ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
    ...(terminalId ? { terminalId } : {}),
    ...(txnNo ? { txnNo } : {}),
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/void-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      origPartnerTxnUid: origPartnerTxnUid || undefined,
      originalTransactionId: origPartnerTxnUid || params.originalTransactionId || undefined,
      txnNo: txnNo || undefined,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeKbankSettlement(params: {
  orderId?: number
  storeCode?: string
  partnerTransactionId?: string
  partnerTxnUid?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  qrType?: string
  payload?: Record<string, unknown>
}): Promise<KbankQrActionResult> {
  const terminalId = String(params.terminalId || '').trim()
  const qrType = String(params.qrType || 'THAI_QR').trim()
  const payload = {
    ...(params.payload || {}),
    ...(terminalId ? { terminalId } : {}),
    qrType,
    ...(String(params.partnerTxnUid || '').trim()
      ? { partnerTxnUid: String(params.partnerTxnUid).trim() }
      : {}),
  }
  const res = await apiFetch('/api/pos/kbank/settlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      qrType,
      ...(terminalId ? { terminalId } : {}),
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || !data.success) {
    return {
      success: false,
      partnerTransactionId: String(data.partnerTransactionId || params.partnerTransactionId || ''),
      originalTransactionId: String(data.originalTransactionId || params.originalTransactionId || ''),
      refId: String(data.refId || params.refId || ''),
      statusCode: String(data.statusCode || ''),
      statusMessage: String(data.statusMessage || data.message || ''),
      data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
      message: String(data.message || data.statusMessage || `HTTP ${res.status}`),
    }
  }
  return {
    success: true,
    partnerTransactionId: String(data.partnerTransactionId || ''),
    originalTransactionId: String(data.originalTransactionId || ''),
    refId: String(data.refId || ''),
    statusCode: String(data.statusCode || ''),
    statusMessage: String(data.statusMessage || ''),
    data: (data.data && typeof data.data === 'object') ? (data.data as Record<string, unknown>) : undefined,
  }
}

export async function executeLinkposPaymentServer(params: {
  amount: number
  bankId: string
  reference1: string
  reference2?: string
  storeCode: string
  orderId?: number
  retryOfAttemptId?: number
  retryOfLocalTxId?: string
  timeoutMs?: number
}) {
  if (!isLinkposCardApiEnabled()) {
    return {
      success: false as const,
      message: 'linkpos_card_api_disabled',
      source: 'disabled' as const,
    }
  }

  const payload = {
    action: 'sale',
    amount: Number(params.amount),
    bankId: String(params.bankId || ''),
    reference1: String(params.reference1 || '').slice(0, 20),
    reference2: String(params.reference2 || '').slice(0, 20),
    storeCode: String(params.storeCode || ''),
    orderId: params.orderId != null ? Number(params.orderId) : undefined,
    retryOfAttemptId: params.retryOfAttemptId != null ? Number(params.retryOfAttemptId) : undefined,
    retryOfLocalTxId: params.retryOfLocalTxId ? String(params.retryOfLocalTxId).slice(0, 20) : undefined,
    protocol: 'hypercom_v2',
    timeoutMs: params.timeoutMs != null ? Number(params.timeoutMs) : undefined,
  }
  const res = await apiFetchWithOffline('/api/linkpos/pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || data?.code || `HTTP ${res.status}`),
      source: 'server' as const,
    }
  }
  return {
    success: true,
    payment: (data.payment || null) as LinkposPaymentSummary | null,
    source: 'server' as const,
  }
}

