import 'server-only'

import { checkKbankQrStatus, voidKbankPayment } from '@/lib/payments/kbank-client'
import {
  extractKbankPaymentTxnNo,
  isKbankInquiryResponseApproved,
  isKbankPaymentTxnNo,
  normalizeKbankTxnStatusToPos,
} from '@/lib/payments/kbank-api-reference'
import {
  evaluateKbankVoidEligibilityFromAttempts,
  kbankVoidReasonToStatusCode,
  needsKbankVoidInquiry,
  type KbankVoidAttemptLike,
  type KbankVoidEligibility,
} from '@/lib/payments/kbank-void-from-order'
import { extractKbankGenerateResponseInfo } from '@/lib/pos-terminal-kbank-helpers'
import { integrationScopeFromAuth } from '@/lib/integration-scope-from-auth'
import type { JwtPayload } from '@/lib/jwt-auth'
import { canVoidKbankQrPayment } from '@/lib/permissions'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32
const inFlightVoidOrderIds = new Set<number>()

type PosOrderVoidRow = {
  id?: number
  order_no?: string | null
  store_code?: string | null
  total?: number | null
  payment_qr?: number | null
  status?: string | null
}

type PosAttemptVoidRow = {
  provider?: string | null
  bank_id?: string | null
  tx_code?: string | null
  local_tx_id?: string | null
  status?: string | null
  approval_code?: string | null
  trace_no?: string | null
  terminal_id?: string | null
  response_text?: string | null
  response_raw?: string | null
  request_raw?: string | null
  response_code?: string | null
  approved_amount?: number | null
}

export type KbankVoidOrderContext = {
  orderId: number
  orderNo: string
  storeCode: string
  amount: number
  status: string
  attempts: KbankVoidAttemptLike[]
  eligibility: KbankVoidEligibility
}

export type KbankVoidForOrderFailure = {
  ok: false
  httpStatus: number
  code: string
  message: string
  eligibility?: KbankVoidEligibility
  preview?: KbankVoidForOrderPreview
}

export type KbankVoidForOrderPreview = {
  orderId: number
  orderNo: string
  amount: number
  qrType: string
  txnRef: string
  txnNo: string
  terminalId: string
  allowVoid: string
  alreadyVoided: boolean
  paid: boolean
  canVoid: boolean
  reason: KbankVoidEligibility['reason']
}

function parseAmount(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function extractApprovedAmount(json: Record<string, unknown>): number {
  const top = [json.txnAmount, json.amount, json.transactionAmount, json.approvedAmount, json.totalAmount]
  for (const c of top) {
    const amount = parseAmount(c)
    if (amount > 0) return amount
  }
  const data = json.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const c of [d.txnAmount, d.amount, d.transactionAmount, d.approvedAmount, d.totalAmount]) {
      const amount = parseAmount(c)
      if (amount > 0) return amount
    }
  }
  return 0
}

function mapAttemptRow(r: PosAttemptVoidRow): KbankVoidAttemptLike {
  return {
    provider: r.provider,
    bankId: r.bank_id,
    txCode: r.tx_code,
    localTxId: r.local_tx_id,
    status: r.status,
    approvalCode: r.approval_code,
    traceNo: r.trace_no,
    terminalId: r.terminal_id,
    responseText: r.response_text,
    responseRaw: r.response_raw,
    requestRaw: r.request_raw,
    responseCode: r.response_code,
    approvedAmount: r.approved_amount,
  }
}

function fail(
  httpStatus: number,
  code: string,
  message: string,
  extra?: Partial<KbankVoidForOrderFailure>
): KbankVoidForOrderFailure {
  return { ok: false, httpStatus, code, message, ...extra }
}

export function previewFromContext(ctx: KbankVoidOrderContext): KbankVoidForOrderPreview {
  const el = ctx.eligibility
  return {
    orderId: ctx.orderId,
    orderNo: ctx.orderNo,
    amount: ctx.amount,
    qrType: el.qrType || 'THAI_QR',
    txnRef: el.partnerTxnUid,
    txnNo: el.txnNo,
    terminalId: el.terminalId,
    allowVoid: el.allowVoid,
    alreadyVoided: el.alreadyVoided,
    paid: el.paid,
    canVoid: el.canVoid,
    reason: el.reason,
  }
}

export async function loadKbankVoidOrderContext(
  orderId: number,
  auth: JwtPayload
): Promise<{ ok: true; ctx: KbankVoidOrderContext } | KbankVoidForOrderFailure> {
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return fail(400, 'KBANK_VOID_ORDER_REQUIRED', 'orderId is required.')
  }
  if (!canVoidKbankQrPayment(String(auth.role || ''))) {
    return fail(403, 'KBANK_VOID_NEED_MANAGER', 'Manager permission is required to void KBank payments.')
  }

  const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,order_no,store_code,total,payment_qr,status',
  })) as PosOrderVoidRow[] | null
  const order = orderRows?.[0]
  if (!order?.id) {
    return fail(404, 'KBANK_VOID_ORDER_NOT_FOUND', 'POS order was not found.')
  }
  const storeCode = String(order.store_code || '').trim()
  if (!storeCode) {
    return fail(400, 'KBANK_VOID_STORE_MISSING', 'Order is missing store_code.')
  }
  const canAccess = await authCanAccessPosStoreWrite(auth, storeCode)
  if (!canAccess) {
    return fail(403, 'KBANK_VOID_STORE_DENIED', 'You cannot void a payment for this store.')
  }

  const attemptRows = (await supabaseSelectFilter('pos_payment_attempts', `order_id=eq.${orderId}`, {
    order: 'created_at.desc',
    limit: 80,
    select:
      'provider,bank_id,tx_code,local_tx_id,status,approval_code,trace_no,terminal_id,response_text,response_raw,request_raw,response_code,approved_amount',
  })) as PosAttemptVoidRow[] | null
  const attempts = (attemptRows || []).map(mapAttemptRow)
  const eligibility = evaluateKbankVoidEligibilityFromAttempts(attempts)
  const paymentQr = Math.max(0, Number(order.payment_qr) || 0)
  const total = Math.max(0, Number(order.total) || 0)
  return {
    ok: true,
    ctx: {
      orderId,
      orderNo: String(order.order_no || '').trim(),
      storeCode,
      amount: paymentQr > 0.005 ? paymentQr : total,
      status: String(order.status || '').trim(),
      attempts,
      eligibility,
    },
  }
}

async function persistInquiryAttempt(params: {
  orderId: number
  partnerTxnUid: string
  requestId: string
  statusLabel: string
  paid: boolean
  resultOk: boolean
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}): Promise<void> {
  const paymentTxnNo = extractKbankPaymentTxnNo(params.response).slice(0, 20)
  const paymentTxnNoFields = isKbankPaymentTxnNo(paymentTxnNo)
    ? {
        trace_no: paymentTxnNo.slice(0, 40),
        approval_code: paymentTxnNo.slice(0, 20),
      }
    : {}
  const approvedAmount = params.paid ? extractApprovedAmount(params.response) : 0
  const status = params.paid ? 'approved' : params.resultOk ? params.statusLabel || 'pending' : 'failed'
  const requestedAt = new Date().toISOString()
  try {
    await supabaseInsert('pos_payment_attempts', {
      order_id: params.orderId,
      local_tx_id: String(params.requestId || `CHK${Date.now()}`).slice(0, 40),
      provider: 'kbank_qr_api',
      mode: 'openapi',
      tx_code: 'STATUS',
      bank_id: 'KBANK',
      request_amount: 0,
      approved_amount: approvedAmount,
      response_code: params.statusCode || null,
      response_text: params.statusMessage || null,
      response_raw: JSON.stringify(params.response || {}),
      status,
      error_reason: params.paid || params.resultOk ? null : params.statusMessage || 'check_status_failed',
      ...paymentTxnNoFields,
      created_at: requestedAt,
    })
  } catch (e) {
    console.error('kbank void-for-order inquiry insert:', e)
  }
  if (params.partnerTxnUid && (params.paid || Boolean(paymentTxnNoFields.trace_no))) {
    try {
      await supabaseUpdateByFilter(
        'pos_payment_attempts',
        `local_tx_id=eq.${encodeURIComponent(params.partnerTxnUid.slice(0, 40))}`,
        {
          order_id: params.orderId,
          ...(params.paid ? { status: 'approved' } : {}),
          response_code: params.statusCode || null,
          response_text: params.statusMessage || null,
          approved_amount: approvedAmount,
          ...paymentTxnNoFields,
        }
      )
    } catch (e) {
      console.error('kbank void-for-order generate update:', e)
    }
  }
}

export async function inquireKbankVoidForOrderOnce(
  ctx: KbankVoidOrderContext,
  auth: JwtPayload
): Promise<{ ok: true; ctx: KbankVoidOrderContext } | KbankVoidForOrderFailure> {
  const el = ctx.eligibility
  if (!needsKbankVoidInquiry(el)) {
    return { ok: true, ctx }
  }
  const kbankRuntime = await resolveKbankRuntime(integrationScopeFromAuth(auth, ctx.storeCode))
  const terminalId = el.terminalId || String(kbankRuntime.terminalId || '').trim()
  const result = await checkKbankQrStatus(
    {
      orderId: ctx.orderId,
      storeCode: ctx.storeCode,
      partnerTransactionId: el.partnerTxnUid,
      originalTransactionId: el.partnerTxnUid,
      terminalId: terminalId || undefined,
      payload: {
        origPartnerTxnUid: el.partnerTxnUid,
        qrType: el.qrType || 'THAI_QR',
        ...(terminalId ? { terminalId } : {}),
      },
    },
    { runtime: kbankRuntime }
  )
  const statusLabel = normalizeKbankTxnStatusToPos(
    (result.response as { txnStatus?: unknown }).txnStatus,
    result.statusCode
  )
  const paid = isKbankInquiryResponseApproved('', result.response, result.statusCode)
  await persistInquiryAttempt({
    orderId: ctx.orderId,
    partnerTxnUid: el.partnerTxnUid,
    requestId: result.requestId,
    statusLabel,
    paid,
    resultOk: result.ok,
    statusCode: result.statusCode,
    statusMessage: result.statusMessage,
    response: result.response,
  })
  const reloaded = await loadKbankVoidOrderContext(ctx.orderId, auth)
  if (!reloaded.ok) return reloaded
  const inquiryInfo = extractKbankGenerateResponseInfo(result.response)
  const paymentTxnNo = extractKbankPaymentTxnNo(result.response)
  const merged = evaluateKbankVoidEligibilityFromAttempts([
    ...reloaded.ctx.attempts,
    {
      provider: 'kbank_qr_api',
      bankId: 'KBANK',
      txCode: 'STATUS',
      localTxId: result.requestId || 'CHK',
      status: paid ? 'approved' : statusLabel || 'pending',
      approvalCode: isKbankPaymentTxnNo(paymentTxnNo) ? paymentTxnNo : '',
      traceNo: isKbankPaymentTxnNo(paymentTxnNo) ? paymentTxnNo : '',
      terminalId,
      responseCode: result.statusCode,
      responseText: result.statusMessage,
      responseRaw: JSON.stringify(result.response || {}),
      approvedAmount: paid ? extractApprovedAmount(result.response) : 0,
    },
  ])
  if (inquiryInfo.allowVoid && !merged.allowVoid) {
    merged.allowVoid = String(inquiryInfo.allowVoid).trim().toUpperCase()
    if (merged.allowVoid === 'N' && merged.reason === 'ok') {
      merged.canVoid = false
      merged.reason = 'allow_void_n'
    }
  }
  return { ok: true, ctx: { ...reloaded.ctx, eligibility: merged } }
}

function buildVoidPartnerTxnUid(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `VOD${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

async function persistVoidAttempt(params: {
  orderId: number
  voidPartnerTxnUid: string
  txnNo: string
  terminalId: string
  ok: boolean
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}): Promise<void> {
  const paymentTxnNo = (isKbankPaymentTxnNo(params.txnNo) ? params.txnNo : extractKbankPaymentTxnNo(params.response)).slice(
    0,
    20
  )
  try {
    await supabaseInsert('pos_payment_attempts', {
      order_id: params.orderId,
      local_tx_id: `${String(params.voidPartnerTxnUid).slice(0, 33)}:VOID`,
      provider: 'kbank_qr_api',
      mode: 'openapi',
      tx_code: 'VOID',
      bank_id: 'KBANK',
      request_amount: 0,
      approved_amount: 0,
      response_code: params.statusCode || null,
      response_text: params.statusMessage || null,
      response_raw: JSON.stringify(params.response || {}),
      status: params.ok ? 'approved' : 'failed',
      error_reason: params.ok ? null : params.statusMessage || 'void_payment_failed',
      ...(params.terminalId ? { terminal_id: params.terminalId } : {}),
      ...(paymentTxnNo
        ? { trace_no: paymentTxnNo.slice(0, 40), approval_code: paymentTxnNo.slice(0, 20) }
        : {}),
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('kbank void-for-order void insert:', e)
  }
}

export async function executeConfirmedKbankVoidForOrder(
  ctx: KbankVoidOrderContext,
  auth: JwtPayload
): Promise<
  | {
      ok: true
      alreadyVoided?: boolean
      preview: KbankVoidForOrderPreview
      partnerTransactionId: string
      origPartnerTxnUid: string
      txnNo: string
      statusCode?: string
      statusMessage?: string
      data: Record<string, unknown>
    }
  | KbankVoidForOrderFailure
> {
  const preview = previewFromContext(ctx)
  if (ctx.eligibility.alreadyVoided) {
    return {
      ok: true,
      alreadyVoided: true,
      preview: { ...preview, alreadyVoided: true, canVoid: false, reason: 'already_voided' },
      partnerTransactionId: '',
      origPartnerTxnUid: ctx.eligibility.partnerTxnUid,
      txnNo: ctx.eligibility.txnNo,
      statusCode: 'KBANK_VOID_ALREADY',
      data: {},
    }
  }
  if (!ctx.eligibility.canVoid) {
    return fail(
      422,
      kbankVoidReasonToStatusCode(ctx.eligibility.reason),
      messageForReason(ctx.eligibility.reason),
      { eligibility: ctx.eligibility, preview }
    )
  }
  const origPartnerTxnUid = ctx.eligibility.partnerTxnUid
  const txnNo = ctx.eligibility.txnNo
  if (!isKbankPaymentTxnNo(txnNo)) {
    return fail(422, 'KBANK_VOID_NO_PAYMENT_TXN_NO', messageForReason('missing_payment_txn_no'), {
      eligibility: ctx.eligibility,
      preview,
    })
  }
  const voidPartnerTxnUid = buildVoidPartnerTxnUid()
  const kbankRuntime = await resolveKbankRuntime(integrationScopeFromAuth(auth, ctx.storeCode))
  const terminalId = ctx.eligibility.terminalId || String(kbankRuntime.terminalId || '').trim()
  const result = await voidKbankPayment(
    {
      orderId: ctx.orderId,
      storeCode: ctx.storeCode,
      origPartnerTxnUid,
      originalTransactionId: origPartnerTxnUid,
      terminalId: terminalId || undefined,
      txnNo,
      payload: {
        partnerTxnUid: voidPartnerTxnUid,
        origPartnerTxnUid,
        txnNo,
        ...(terminalId ? { terminalId } : {}),
      },
    },
    { runtime: kbankRuntime }
  )
  await persistVoidAttempt({
    orderId: ctx.orderId,
    voidPartnerTxnUid,
    txnNo,
    terminalId,
    ok: result.ok,
    statusCode: result.statusCode,
    statusMessage: result.statusMessage,
    response: result.response,
  })
  try {
    await writePosOrderAuditTrail({
      orderId: ctx.orderId,
      orderNo: ctx.orderNo,
      storeCode: ctx.storeCode,
      actionType: 'kbank_qr_void',
      idempotencyKey: `kbank-void:${ctx.orderId}:${origPartnerTxnUid}`,
      actor: {
        name: auth.name,
        role: auth.role,
        store: auth.store,
        employeeCode: auth.employeeCode,
        employeeId: auth.employeeId,
      },
      source: 'pos_kbank_void_for_order',
      reason: result.ok ? 'void_ok' : 'void_failed',
      before: {
        origPartnerTxnUid,
        txnNo,
        qrType: ctx.eligibility.qrType,
        allowVoid: ctx.eligibility.allowVoid,
      },
      after: {
        ok: result.ok,
        statusCode: result.statusCode || null,
        statusMessage: result.statusMessage || null,
        voidPartnerTxnUid,
        bankResponse: result.response || null,
      },
    })
  } catch (e) {
    console.error('kbank void-for-order audit:', e)
  }
  if (!result.ok) {
    return fail(422, result.statusCode || 'KBANK_VOID_FAILED', result.statusMessage || 'void_payment_failed', {
      eligibility: ctx.eligibility,
      preview,
    })
  }
  return {
    ok: true,
    preview: { ...preview, alreadyVoided: true, canVoid: false, reason: 'already_voided' },
    partnerTransactionId: voidPartnerTxnUid,
    origPartnerTxnUid,
    txnNo: extractKbankPaymentTxnNo(result.response) || txnNo,
    statusCode: result.statusCode,
    statusMessage: result.statusMessage,
    data: result.response,
  }
}

export function tryLockKbankVoidForOrder(orderId: number): boolean {
  if (inFlightVoidOrderIds.has(orderId)) return false
  inFlightVoidOrderIds.add(orderId)
  return true
}

export function unlockKbankVoidForOrder(orderId: number): void {
  inFlightVoidOrderIds.delete(orderId)
}

export function messageForReason(reason: KbankVoidEligibility['reason']): string {
  switch (reason) {
    case 'already_voided':
      return 'This KBank payment was already voided.'
    case 'allow_void_n':
      return 'KBank does not allow Void for this payment (allowVoid=N).'
    case 'not_paid':
      return 'This payment is not settled yet, so it cannot be voided.'
    case 'apic_session_only':
    case 'missing_payment_txn_no':
      return 'Payment transaction number was not found. APIC session ids cannot be sent to Void.'
    case 'no_kbank_attempt':
      return 'No KBank QR transaction was found for this bill.'
    default:
      return 'KBank Void is not available for this bill.'
  }
}
