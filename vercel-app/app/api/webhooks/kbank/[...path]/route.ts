import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { normalizeKbankTxnStatusToPos } from '@/lib/payments/kbank-api-reference'

export const dynamic = 'force-dynamic'

type AnyObj = Record<string, unknown>

function getPathValue(obj: AnyObj, path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as AnyObj)[p]
  }
  return cur
}

function pickFirst(obj: AnyObj, paths: string[]): string {
  for (const p of paths) {
    const raw = getPathValue(obj, p)
    const v = String(raw ?? '').trim()
    if (v) return v
  }
  return ''
}

function parsePathListFromEnv(envName: string, fallback: string[]): string[] {
  const raw = String(process.env[envName] || '').trim()
  if (!raw) return fallback
  const parsed = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

function normalizeStatus(txnStatus: string, statusCode: string): 'approved' | 'declined' | 'pending' | 'failed' {
  return normalizeKbankTxnStatusToPos(txnStatus, statusCode)
}

function parseAmount(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function normalizeLocalTxId(value: unknown): string {
  return String(value ?? '').trim().slice(0, 40)
}

function buildLocalTxCandidates(...values: unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeLocalTxId(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeSignatureInput(v: string): string {
  const s = String(v || '').trim()
  if (!s) return ''
  return s.replace(/^sha256=/i, '').trim()
}

function verifyKbankSignature(rawBody: string, req: NextRequest) {
  const secret = String(process.env.KBANK_WEBHOOK_SIGNATURE_SECRET || '').trim()
  if (!secret) return { verified: false, reason: 'signature_secret_missing' as const }

  const headerName = String(process.env.KBANK_WEBHOOK_SIGNATURE_HEADER || 'x-signature').trim().toLowerCase()
  const providedRaw = String(req.headers.get(headerName) || '').trim()
  if (!providedRaw) return { verified: false, reason: 'signature_header_missing' as const }

  const provided = normalizeSignatureInput(providedRaw)
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return { verified: false, reason: 'signature_mismatch' as const }
  if (!timingSafeEqual(a, b)) return { verified: false, reason: 'signature_mismatch' as const }
  return { verified: true, reason: 'ok' as const }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
    },
  })
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return NextResponse.json({
    ok: true,
    method: 'GET',
    path: path ?? [],
    webhook: 'kbank',
  })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  const rawBody = await req.text().catch(() => '')
  let body: AnyObj = {}
  try {
    body = rawBody ? (JSON.parse(rawBody) as AnyObj) : {}
  } catch {
    body = {}
  }

  const sig = verifyKbankSignature(rawBody, req)
  const allowUnsigned = String(process.env.KBANK_WEBHOOK_ALLOW_UNSIGNED || '1').trim() !== '0'
  if (!sig.verified && !allowUnsigned) {
    return NextResponse.json(
      { ok: false, message: 'invalid_signature', reason: sig.reason, path: path ?? [] },
      { status: 401 }
    )
  }

  const partnerTransactionIdPaths = parsePathListFromEnv('KBANK_WEBHOOK_PARTNER_TXN_PATHS', [
    'partnerTxnUid',
    'partnerTransactionId',
    'partnerTxnId',
    'data.partnerTxnUid',
    'data.partnerTransactionId',
    'data.partnerTxnId',
  ])
  const originalTransactionIdPaths = parsePathListFromEnv('KBANK_WEBHOOK_ORIGINAL_TXN_PATHS', [
    'origPartnerTxnUid',
    'originalTransactionId',
    'transactionId',
    'data.origPartnerTxnUid',
    'data.originalTransactionId',
    'data.transactionId',
  ])
  const refIdPaths = parsePathListFromEnv('KBANK_WEBHOOK_REF_ID_PATHS', [
    'refId',
    'referenceId',
    'data.refId',
    'data.referenceId',
  ])
  const statusCodePaths = parsePathListFromEnv('KBANK_WEBHOOK_STATUS_CODE_PATHS', [
    'statusCode',
    'code',
    'data.statusCode',
    'data.code',
  ])
  const statusMessagePaths = parsePathListFromEnv('KBANK_WEBHOOK_STATUS_MESSAGE_PATHS', [
    'errorDesc',
    'errorCode',
    'statusMessage',
    'message',
    'data.errorDesc',
    'data.errorCode',
    'data.statusMessage',
    'data.message',
  ])
  const transactionStatusPaths = parsePathListFromEnv('KBANK_WEBHOOK_TXN_STATUS_PATHS', [
    'txnStatus',
    'transactionStatus',
    'status',
    'paymentStatus',
    'data.txnStatus',
    'data.transactionStatus',
    'data.status',
    'data.paymentStatus',
  ])
  const amountPaths = parsePathListFromEnv('KBANK_WEBHOOK_AMOUNT_PATHS', [
    'txnAmount',
    'amount',
    'transactionAmount',
    'data.txnAmount',
    'data.amount',
    'data.transactionAmount',
  ])

  const partnerTransactionId = pickFirst(body, partnerTransactionIdPaths)
  const originalTransactionId = pickFirst(body, originalTransactionIdPaths)
  const refId = pickFirst(body, refIdPaths)
  const statusCode = pickFirst(body, statusCodePaths)
  const statusMessage = pickFirst(body, statusMessagePaths)
  const transactionStatusRaw = pickFirst(body, transactionStatusPaths)
  const localTxCandidates = buildLocalTxCandidates(
    partnerTransactionId,
    originalTransactionId
  )
  const primaryLocalTxId = localTxCandidates[0] || ''
  const normalized = normalizeStatus(transactionStatusRaw, statusCode)
  const amountRawPath = amountPaths.find((p) => String(getPathValue(body, p) ?? '').trim() !== '')
  const amount = parseAmount(amountRawPath ? getPathValue(body, amountRawPath) : undefined)

  const safeBodyForLog = rawBody.length > 50000 ? `${rawBody.slice(0, 50000)}...` : rawBody

  try {
    if (localTxCandidates.length > 0) {
      for (const candidate of localTxCandidates) {
        await supabaseUpdateByFilter(
          'pos_payment_attempts',
          `local_tx_id=eq.${encodeURIComponent(candidate)}`,
          {
            status: normalized,
            response_code: statusCode || null,
            response_text: statusMessage || transactionStatusRaw || null,
            approved_amount: normalized === 'approved' ? amount : 0,
            response_raw: safeBodyForLog || null,
            error_reason:
              normalized === 'declined' || normalized === 'failed'
                ? (statusMessage || transactionStatusRaw || 'kbank_webhook_declined')
                : null,
          }
        )
      }
    } else {
      const fallbackLocalTxId = `kbank-webhook-${Date.now()}`
      await supabaseInsert('pos_payment_attempts', {
        local_tx_id: fallbackLocalTxId,
        provider: 'kbank_qr_api',
        mode: 'openapi',
        tx_code: 'WEBHOOK',
        bank_id: 'KBANK',
        request_amount: amount || 0,
        approved_amount: normalized === 'approved' ? amount : 0,
        response_raw: safeBodyForLog || null,
        response_code: statusCode || null,
        response_text: statusMessage || transactionStatusRaw || null,
        status: normalized,
        error_reason:
          normalized === 'declined' || normalized === 'failed'
            ? (statusMessage || transactionStatusRaw || 'kbank_webhook_declined')
            : null,
        created_at: new Date().toISOString(),
      })
    }
  } catch (e) {
    console.error('kbank webhook upsert attempt failed:', e)
  }

  let matchedAttemptId: string | null = null
  let matchedOrderId: number | null = null
  let matchedLocalTxId: string | null = null
  try {
    for (const candidate of localTxCandidates) {
      const hit = (await supabaseSelectFilter(
        'pos_payment_attempts',
        `local_tx_id=eq.${encodeURIComponent(candidate)}`,
        { limit: 1, order: 'created_at.desc', select: 'id,order_id' }
      )) as { id?: number; order_id?: number | null }[]
      if (hit?.[0]?.id != null) {
        matchedAttemptId = String(hit[0].id)
        matchedLocalTxId = candidate
      }
      if (hit?.[0]?.order_id != null) matchedOrderId = Number(hit[0].order_id)
      if (matchedAttemptId) break
    }
  } catch {
    /* noop */
  }

  try {
    if (matchedOrderId && normalized === 'approved') {
      await supabaseUpdateByFilter('pos_orders', `id=eq.${matchedOrderId}`, { status: 'paid' })
    }
  } catch (e) {
    console.error('kbank webhook update pos_orders failed:', e)
  }

  // KBank callback response format compatibility:
  // success=00, error=10 (see API reference/generic codes).
  return NextResponse.json({
    statusCode: '00',
    errorCode: null,
    errorDesc: null,
    partnerTxnUid: normalizeLocalTxId(partnerTransactionId) || null,
    originalTransactionId: originalTransactionId || null,
    refId: refId || null,
    status: normalized,
    matchedAttemptId,
    matchedOrderId,
    matchedLocalTxId: matchedLocalTxId || primaryLocalTxId || null,
  })
}
