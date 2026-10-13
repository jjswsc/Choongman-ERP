import { generateKbankQr } from '@/lib/payments/kbank-client'
import {
  extractKbankQrResponseMeta,
  extractKbankQrSessionTxnNo,
  maskKbankMessageForLog,
  resolveKbankDisplayQrTypeDetails,
  resolveKbankQrTypeCode,
} from '@/lib/payments/kbank-api-reference'
import type { KbankGenerateQrRequest } from '@/lib/payments/kbank-types'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

const KBANK_PARTNER_TXN_UID_MAX_LEN = 32

export function isDuplicateLocalTxIdError(msg: string): boolean {
  return /23505|duplicate key value/i.test(msg) && /local_tx_id/i.test(msg)
}

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

  const sessionTxnNo = extractKbankQrSessionTxnNo(responseData).slice(0, 40)
  const attemptRefresh = {
    order_id: orderId > 0 ? orderId : null,
    request_amount: amount,
    ...(sessionTxnNo ? { trace_no: sessionTxnNo } : {}),
    request_raw: JSON.stringify(result.requestBodyMasked || {}),
    response_raw: JSON.stringify(result.responseBodyMasked || maskKbankMessageForLog(responseData)),
    response_code: result.statusCode || null,
    response_text: result.statusMessage || null,
  }
  try {
    await supabaseInsert('pos_payment_attempts', {
      ...attemptRefresh,
      local_tx_id: partnerTransactionId,
      provider: 'kbank_qr_api',
      mode: 'openapi',
      tx_code: 'QR',
      bank_id: 'KBANK',
      approved_amount: 0,
      status: result.ok ? 'pending' : 'failed',
      error_reason: result.ok ? null : result.statusMessage || 'generate_qr_failed',
      created_at: requestedAt,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isDuplicateLocalTxIdError(msg)) {
      console.error('member-portal kbank attempt insert:', e)
    } else if (result.ok) {
      // 같은 partnerTxnUid 재발급(잔액 동일 재사용) — 승인된 행은 건드리지 않는다.
      try {
        await supabaseUpdateByFilter(
          'pos_payment_attempts',
          `local_tx_id=eq.${encodeURIComponent(partnerTransactionId)}&status=in.(pending,failed)`,
          { ...attemptRefresh, status: 'pending', error_reason: null }
        )
      } catch (e2) {
        console.error('member-portal kbank attempt refresh:', e2)
      }
    }
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
