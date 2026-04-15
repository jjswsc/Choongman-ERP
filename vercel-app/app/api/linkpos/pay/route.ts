import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { runHypercomSaleOnRelay } from '@/lib/payments/linkpos-server'
import type { LinkposPaymentSummary } from '@/lib/payments/types'

function classifyAttemptStatus(responseCode: string): string {
  if (responseCode === '00') return 'approved'
  if (responseCode === 'ND') return 'declined'
  if (responseCode === 'NB') return 'failed'
  return 'failed'
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await req.json()
    const amount = Math.max(0, Number(body?.amount ?? 0))
    const bankId = String(body?.bankId ?? '').trim()
    const reference1 = String(body?.reference1 ?? '').trim().slice(0, 20)
    const reference2 = String(body?.reference2 ?? '').trim().slice(0, 20)
    const retryOfLocalTxId = String(body?.retryOfLocalTxId ?? '').trim().slice(0, 20)
    const retryOfAttemptIdRaw = Number(body?.retryOfAttemptId ?? 0)
    const retryOfAttemptId = Number.isFinite(retryOfAttemptIdRaw) && retryOfAttemptIdRaw > 0 ? retryOfAttemptIdRaw : null
    const requestedAt = new Date().toISOString()

    if (amount <= 0) {
      return NextResponse.json({ success: false, message: 'amount_required' }, { status: 400, headers })
    }
    if (!reference1) {
      return NextResponse.json({ success: false, message: 'reference1_required' }, { status: 400, headers })
    }
    if (retryOfLocalTxId && retryOfLocalTxId === reference1) {
      return NextResponse.json({ success: false, message: 'retry_reference1_must_be_new' }, { status: 400, headers })
    }

    // R1 멱등: 이미 승인된 시도 재호출이면 승인 결과를 재사용
    try {
      const prior = (await supabaseSelectFilter(
        'pos_payment_attempts',
        `local_tx_id=eq.${encodeURIComponent(reference1)}`,
        {
          limit: 1,
          order: 'created_at.desc',
          select:
            'response_code,approval_code,trace_no,terminal_id,merchant_id,bank_id,tx_code,request_amount,approved_amount,created_at',
        }
      )) as {
        response_code?: string
        approval_code?: string
        trace_no?: string
        terminal_id?: string
        merchant_id?: string
        bank_id?: string
        tx_code?: string
        request_amount?: number
        approved_amount?: number
        created_at?: string
      }[]
      const row = prior?.[0]
      if (row && String(row.response_code ?? '') === '00') {
        const payment: LinkposPaymentSummary = {
          provider: 'kbtg_linkpos',
          mode: 'hypercom',
          txCode: '20',
          bankId: String(row.bank_id ?? bankId),
          responseCode: '00',
          approvalCode: String(row.approval_code ?? ''),
          traceNo: String(row.trace_no ?? ''),
          terminalId: String(row.terminal_id ?? ''),
          merchantId: String(row.merchant_id ?? ''),
          reference1,
          requestedAmount: Number(row.request_amount ?? amount),
          approvedAmount: Number(row.approved_amount ?? amount),
          requestedAt: String(row.created_at ?? requestedAt),
          respondedAt: requestedAt,
        }
        if (body?.orderId && Number(body.orderId) > 0) {
          try {
            await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(body.orderId)}`, {
              linkpos_provider: payment.provider,
              linkpos_mode: payment.mode,
              linkpos_tx_code: payment.txCode,
              linkpos_bank_id: payment.bankId,
              linkpos_response_code: payment.responseCode,
              linkpos_approval_code: payment.approvalCode ?? null,
              linkpos_trace_no: payment.traceNo ?? null,
              linkpos_terminal_id: payment.terminalId ?? null,
              linkpos_merchant_id: payment.merchantId ?? null,
              linkpos_reference1: payment.reference1,
              linkpos_requested_amount: payment.requestedAmount,
              linkpos_approved_amount: payment.approvedAmount,
              linkpos_requested_at: payment.requestedAt,
              linkpos_responded_at: payment.respondedAt,
            })
          } catch (e) {
            console.error('linkpos/pay duplicate pos_orders update:', e)
          }
        }
        return NextResponse.json({ success: true, payment, duplicate: true }, { headers })
      }
    } catch (e) {
      console.error('linkpos/pay idempotency check:', e)
    }

    const result = await runHypercomSaleOnRelay({
      amount,
      bankId,
      reference1,
      reference2,
      timeoutMs: Math.max(2000, Number(body?.timeoutMs ?? 12000)),
      mode: 'hypercom',
    })
    const respondedAt = new Date().toISOString()

    try {
      await supabaseInsert('pos_payment_attempts', {
        order_id: body?.orderId ? Number(body.orderId) : null,
        local_tx_id: reference1,
        provider: 'kbtg_linkpos',
        mode: 'hypercom',
        tx_code: result.txCode,
        retry_of_attempt_id: retryOfAttemptId,
        retry_of_local_tx_id: retryOfLocalTxId || null,
        bank_id: bankId || null,
        request_amount: amount,
        approved_amount: result.ok ? amount : 0,
        request_raw: result.rawRequestHex ?? null,
        response_raw: result.rawResponseHex ?? null,
        response_code: result.responseCode || null,
        approval_code: result.approvalCode ?? null,
        trace_no: result.traceNo ?? null,
        terminal_id: result.terminalId ?? null,
        merchant_id: result.merchantId ?? null,
        response_text: result.responseText ?? null,
        status: classifyAttemptStatus(result.responseCode),
        error_reason: result.errorMessage ?? null,
        created_at: requestedAt,
      })
    } catch (e) {
      console.error('linkpos/pay attempt insert:', e)
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          code: result.responseCode || 'ND',
          message: result.errorMessage || result.responseText || 'declined',
          detail: result,
        },
        { status: 422, headers }
      )
    }

    const payment: LinkposPaymentSummary = {
      provider: 'kbtg_linkpos',
      mode: 'hypercom',
      txCode: '20',
      bankId,
      responseCode: result.responseCode || '00',
      approvalCode: result.approvalCode,
      traceNo: result.traceNo,
      refNo: result.refNo,
      terminalId: result.terminalId,
      merchantId: result.merchantId,
      reference1,
      requestedAmount: amount,
      approvedAmount: amount,
      requestedAt,
      respondedAt,
    }

    if (body?.orderId && Number(body.orderId) > 0) {
      try {
        await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(body.orderId)}`, {
          linkpos_provider: payment.provider,
          linkpos_mode: payment.mode,
          linkpos_tx_code: payment.txCode,
          linkpos_bank_id: payment.bankId,
          linkpos_response_code: payment.responseCode,
          linkpos_approval_code: payment.approvalCode ?? null,
          linkpos_trace_no: payment.traceNo ?? null,
          linkpos_ref_no: payment.refNo ?? null,
          linkpos_terminal_id: payment.terminalId ?? null,
          linkpos_merchant_id: payment.merchantId ?? null,
          linkpos_reference1: payment.reference1,
          linkpos_requested_amount: payment.requestedAmount,
          linkpos_approved_amount: payment.approvedAmount,
          linkpos_requested_at: payment.requestedAt,
          linkpos_responded_at: payment.respondedAt,
        })
      } catch (e) {
        console.error('linkpos/pay pos_orders update:', e)
      }
    }

    return NextResponse.json({ success: true, payment }, { headers })
  } catch (e) {
    console.error('linkpos/pay:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 503, headers })
  }
}
