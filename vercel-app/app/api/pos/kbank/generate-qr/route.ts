import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { generateKbankQr } from '@/lib/payments/kbank-client'
import { supabaseInsert } from '@/lib/supabase-server'
import type { KbankGenerateQrRequest } from '@/lib/payments/kbank-types'
import { integrationScopeFromAuth } from '@/lib/integration-scope-from-auth'
import { resolveKbankRuntime } from '@/lib/tenant-integration-resolve'
import {
  extractKbankQrResponseMeta,
  isKbankFetchAbortError,
  maskKbankMessageForLog,
  resolveKbankDisplayQrTypeDetails,
  resolveKbankQrTypeCode,
} from '@/lib/payments/kbank-api-reference'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function withCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return res
}

function toSafeNumber(v: unknown): number {
  const raw = typeof v === 'string' ? v.replace(/,/g, '').trim() : v
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function normalizeQrType(v: unknown): { raw: string; normalized: 'THAI_QR' | 'CREDIT_CARD' | '' } {
  const raw = String(v || '').trim()
  if (!raw) return { raw: '', normalized: '' }
  const key = raw
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
  if (key.includes('CREDIT') || key.includes('CARD') || key === 'QRCC') {
    return { raw, normalized: 'CREDIT_CARD' }
  }
  if (key.includes('THAI') || key === 'THQR' || key === 'THAI_QR') {
    return { raw, normalized: 'THAI_QR' }
  }
  return { raw, normalized: '' }
}

function buildPartnerTransactionId(seed?: string): string {
  const KBANK_PARTNER_TXN_UID_MAX_LEN = 32
  const s = String(seed || '').trim()
  if (s) return s.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
  const rand = Math.random().toString(36).slice(2, 10)
  return `P${Date.now()}${rand}`.slice(0, KBANK_PARTNER_TXN_UID_MAX_LEN)
}

function pickPrimitiveText(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'bigint') return String(v).trim()
  return ''
}

function extractQrPayloadMeta(raw: unknown): {
  payload: string
  sourceKey: string
  length: number
  startsWith000201: boolean
} {
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
      if (!value) continue
      return {
        payload: value,
        sourceKey: key,
        length: value.length,
        startsWith000201: value.startsWith('000201'),
      }
    }
  }
  return {
    payload: '',
    sourceKey: '',
    length: 0,
    startsWith000201: false,
  }
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }))
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    return withCorsHeaders(authResult.errorResponse)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const amount = toSafeNumber(body.amount)
    const orderId = Number(body.orderId || 0)
    const storeCode = String(body.storeCode || '').trim()
    const partnerTransactionId = buildPartnerTransactionId(
      String(body.partnerTransactionId || body.partnerTxnUid || '')
    )
    const qrTypeInfo = normalizeQrType(body.qrType)
    const qrType = qrTypeInfo.normalized || qrTypeInfo.raw || undefined
    const payloadObj =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : undefined
    const scope = integrationScopeFromAuth(authResult.auth, storeCode)
    const kbankRuntime = await resolveKbankRuntime(scope)
    const terminalId = String(
      body.terminalId || payloadObj?.terminalId || kbankRuntime.terminalId || process.env.KBANK_TERMINAL_ID || ''
    ).trim()

    if (amount <= 0) {
      return withCorsHeaders(
        NextResponse.json(
          { success: false, message: 'amount must be greater than 0.' },
          { status: 400 }
        )
      )
    }
    if (qrTypeInfo.normalized === 'THAI_QR' && amount > 80000) {
      return withCorsHeaders(
        NextResponse.json(
          {
            success: false,
            statusCode: 'AMOUNT_LIMIT_EXCEEDED',
            message: 'Thai QR amount must not exceed 80,000 THB.',
          },
          { status: 422 }
        )
      )
    }
    const sentQrTypeCode = resolveKbankQrTypeCode(qrType)

    const payload: KbankGenerateQrRequest = {
      amount,
      qrType,
      orderId: orderId > 0 ? orderId : undefined,
      storeCode: storeCode || undefined,
      partnerTransactionId,
      reference1: String(body.reference1 || '').trim() || undefined,
      reference2: String(body.reference2 || '').trim() || undefined,
      reference3: String(body.reference3 || '').trim() || undefined,
      reference4: String(body.reference4 || '').trim() || undefined,
      payload: terminalId ? { ...(payloadObj || {}), terminalId } : payloadObj,
    }

    const requestedAt = new Date().toISOString()
    const result = await generateKbankQr(payload, { runtime: kbankRuntime })

    const status = result.ok ? 200 : result.statusCode === 'TIMEOUT' ? 504 : 422
    const responseData = result.response && typeof result.response === 'object'
      ? (result.response as Record<string, unknown>)
      : {}
    const qrMeta = extractQrPayloadMeta(responseData)
    const bankQrMeta = extractKbankQrResponseMeta(responseData)
    const qrTypeDetails = resolveKbankDisplayQrTypeDetails({
      qrType: bankQrMeta.qrTypeCode,
      sof: bankQrMeta.sof,
      requested: qrTypeInfo.normalized || 'THAI_QR',
      emvPayload: qrMeta.payload,
    })
    const displayQrType = qrTypeDetails.displayType
    const qrTypeMismatch =
      qrTypeInfo.normalized === 'CREDIT_CARD' && displayQrType === 'THAI_QR'
    const requestMessage = result.requestBodyMasked || null
    const bankResponseMessage = result.responseBodyMasked || maskKbankMessageForLog(responseData)
    const auditBundle = {
      partnerTransactionId,
      storeCode: storeCode || null,
      requestedQrType: qrTypeInfo.normalized || qrTypeInfo.raw || null,
      sentQrTypeCode: result.sentQrTypeCode || sentQrTypeCode,
      terminalIdIncluded: Boolean(terminalId),
      bankQrTypeCode: bankQrMeta.qrTypeCode || null,
      bankSof: bankQrMeta.sof || null,
      displayQrType,
      displayQrTypeSource: qrTypeDetails.source,
      qrTypeMismatch,
      requestMessage,
      responseMessage: bankResponseMessage,
    }

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
        request_raw: JSON.stringify(requestMessage || {}),
        response_raw: JSON.stringify(bankResponseMessage || {}),
        response_code: result.statusCode || null,
        response_text: result.statusMessage || null,
        status: result.ok ? 'pending' : 'failed',
        error_reason: result.ok ? null : result.statusMessage || 'generate_qr_failed',
        created_at: requestedAt,
      })
    } catch (insertErr) {
      console.error('pos/kbank/generate-qr attempt insert:', insertErr)
    }

    if (result.ok) {
      console.info('kbank/generate-qr meta:', {
        partnerTransactionId,
        storeCode: storeCode || null,
        requestedQrType: qrTypeInfo.normalized || qrTypeInfo.raw || null,
        sentQrTypeCode: result.sentQrTypeCode || sentQrTypeCode,
        terminalIdIncluded: Boolean(terminalId),
        bankQrTypeCode: bankQrMeta.qrTypeCode || null,
        bankSof: bankQrMeta.sof || null,
        displayQrType,
        displayQrTypeSource: qrTypeDetails.source,
        qrTypeMismatch,
        sourceKey: qrMeta.sourceKey || null,
        payloadLength: qrMeta.length,
        startsWith000201: qrMeta.startsWith000201,
      })
      console.info('kbank/generate-qr audit:', {
        partnerTxnUid: partnerTransactionId,
        ok: true,
        ...auditBundle,
      })
    } else {
      console.info('kbank/generate-qr audit:', {
        partnerTxnUid: partnerTransactionId,
        ok: false,
        ...auditBundle,
        statusCode: result.statusCode || null,
      })
    }
    const responseCode = String(responseData.code || '').trim()
    const responseMessage = String(responseData.message || '').trim()
    const failureMessage =
      result.statusMessage ||
      responseMessage ||
      responseCode ||
      'kbank_generate_qr_failed'
    return withCorsHeaders(
      NextResponse.json(
        {
          success: result.ok,
          message: result.ok ? undefined : failureMessage,
          partnerTransactionId,
          requestedQrType: qrTypeInfo.normalized || qrTypeInfo.raw || null,
          sentQrTypeCode: result.sentQrTypeCode || sentQrTypeCode,
          bankQrTypeCode: bankQrMeta.qrTypeCode || null,
          bankSof: bankQrMeta.sof || null,
          displayQrType,
          displayQrTypeSource: qrTypeDetails.source,
          qrTypeMismatch,
          terminalIdIncluded: Boolean(terminalId),
          requestMessage,
          responseMessage: bankResponseMessage,
          qrType: qrType || null,
          amount,
          orderId: orderId > 0 ? orderId : null,
          storeCode: storeCode || null,
          statusCode: result.statusCode || responseCode || null,
          statusMessage: result.statusMessage || responseMessage || null,
          qrPayloadMeta: result.ok
            ? {
                sourceKey: qrMeta.sourceKey || null,
                payloadLength: qrMeta.length,
                startsWith000201: qrMeta.startsWith000201,
              }
            : null,
          data: result.response,
        },
        { status }
      )
    )
  } catch (e) {
    const aborted = isKbankFetchAbortError(e)
    const message = aborted
      ? 'KBank QR generate timed out. Please retry.'
      : e instanceof Error
        ? e.message
        : 'kbank_generate_qr_error'
    console.error('pos/kbank/generate-qr:', aborted ? message : e)
    return withCorsHeaders(
      NextResponse.json(
        {
          success: false,
          message,
          statusCode: aborted ? 'TIMEOUT' : null,
        },
        { status: aborted ? 504 : 500 }
      )
    )
  }
}
