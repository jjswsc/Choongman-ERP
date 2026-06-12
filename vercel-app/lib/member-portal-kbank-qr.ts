import { generateKbankQr } from '@/lib/payments/kbank-client'
import {
  extractKbankQrResponseMeta,
  maskKbankMessageForLog,
  resolveKbankDisplayQrTypeDetails,
  resolveKbankQrTypeCode,
} from '@/lib/payments/kbank-api-reference'
import type { KbankGenerateQrRequest } from '@/lib/payments/kbank-types'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'
import { supabaseInsert } from '@/lib/supabase-server'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

function pickPrimitiveText(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'bigint') return String(v).trim()
  return ''
}

export function extractKbankEmvQrPayload(raw: unknown): string {
  const keys = ['qrPayload', 'qrCode', 'qrString', 'qrData', 'payload', 'qrRawData', 'qrRaw', 'thaiQr']
  const sources: Record<string, unknown>[] = []
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const root = raw as Record<string, unknown>
    sources.push(root)
    for (const nestedKey of ['data', 'result', 'payment', 'paymentInfo']) {
      const nested = root[nestedKey]
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        sources.push(nested as Record<string, unknown>)
      }
    }
  }
  for (const obj of sources) {
    for (const key of keys) {
      const value = pickPrimitiveText(obj[key])
      if (value) return value
    }
  }
  return ''
}

export function buildMemberPortalKbankPartnerTxnId(seed?: string): string {
  const s = String(seed || '').trim()
  if (s) return s.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const rand = Math.random().toString(36).slice(2, 10)
  return `M${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

export async function generateMemberPortalKbankQr(params: {
  amount: number
  orderId: number
  storeCode: string
  tenantId?: string
  partnerTransactionId?: string
}): Promise<{
  ok: boolean
  partnerTransactionId: string
  qrPayload: string
  displayQrType: 'THAI_QR' | 'CREDIT_CARD'
  statusMessage?: string
}> {
  const amount = Math.round(Number(params.amount || 0) * 100) / 100
  const orderId = Number(params.orderId || 0)
  const storeCode = String(params.storeCode || '').trim()
  const partnerTransactionId = buildMemberPortalKbankPartnerTxnId(params.partnerTransactionId)
  const runtime = await resolveKbankRuntime({
    tenantId: params.tenantId,
    storeCode,
  })
  const terminalId = String(runtime.terminalId || '').trim()
  const qrType = 'THAI_QR'

  if (amount < 1) {
    return {
      ok: false,
      partnerTransactionId,
      qrPayload: '',
      displayQrType: 'THAI_QR',
      statusMessage: 'amount_below_minimum',
    }
  }

  const payload: KbankGenerateQrRequest = {
    amount,
    qrType,
    orderId: orderId > 0 ? orderId : undefined,
    storeCode: storeCode || undefined,
    partnerTransactionId,
    payload: terminalId ? { terminalId } : undefined,
  }

  const requestedAt = new Date().toISOString()
  const result = await generateKbankQr(payload, { runtime })
  const responseData =
    result.response && typeof result.response === 'object'
      ? (result.response as Record<string, unknown>)
      : {}
  const qrPayload = extractKbankEmvQrPayload(responseData)
  const bankQrMeta = extractKbankQrResponseMeta(responseData)
  const qrTypeDetails = resolveKbankDisplayQrTypeDetails({
    qrType: bankQrMeta.qrTypeCode,
    sof: bankQrMeta.sof,
    requested: 'THAI_QR',
    emvPayload: qrPayload,
  })

  try {
    await supabaseInsert('pos_payment_attempts', {
      order_id: orderId > 0 ? orderId : null,
      local_tx_id: partnerTransactionId,
      provider: 'kbank_qr_api',
      mode: 'openapi',
      tx_code: 'QR',
      bank_id: 'KBANK',
      request_amount: amount,
      approved_amount: 0,
      request_raw: JSON.stringify(result.requestBodyMasked || {}),
      response_raw: JSON.stringify(result.responseBodyMasked || maskKbankMessageForLog(responseData)),
      response_code: result.statusCode || null,
      response_text: result.statusMessage || null,
      status: result.ok ? 'pending' : 'failed',
      error_reason: result.ok ? null : result.statusMessage || 'generate_qr_failed',
      created_at: requestedAt,
    })
  } catch (e) {
    console.error('member-portal kbank attempt insert:', e)
  }

  void resolveKbankQrTypeCode(qrType)

  return {
    ok: result.ok && Boolean(qrPayload),
    partnerTransactionId,
    qrPayload,
    displayQrType: qrTypeDetails.displayType,
    statusMessage: result.statusMessage || (qrPayload ? undefined : 'qr_payload_missing'),
  }
}
