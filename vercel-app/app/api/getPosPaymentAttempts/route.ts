import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

/** LINKPOS 결제 시도 조회 (실패 관리 탭용) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || 'failed').trim().toLowerCase()
  const limit = Math.max(1, Math.min(5000, Number(searchParams.get('limit') || 1000)))

  const startDate = startStr ? startStr.slice(0, 10) : ''
  const endDate = endStr ? endStr.slice(0, 10) : ''

  try {
    const filters: string[] = []
    if (startDate && endDate) {
      const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)
      filters.push(`created_at=gte.${encodeURIComponent(startISO)}`)
      filters.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
    }
    if (status && status !== 'all') {
      if (status === 'failed') {
        filters.push('status=in.(declined,failed,timeout,error)')
      } else {
        filters.push(`status=eq.${encodeURIComponent(status)}`)
      }
    }

    const selectFields =
      'id,order_id,local_tx_id,provider,mode,tx_code,retry_of_attempt_id,retry_of_local_tx_id,bank_id,request_amount,approved_amount,response_code,approval_code,trace_no,terminal_id,merchant_id,response_text,status,error_reason,created_at,pos_orders(order_no,store_code,total)'
    const rows = ((filters.length
      ? await supabaseSelectFilter(
          'pos_payment_attempts',
          filters.join('&'),
          {
            order: 'created_at.desc',
            limit,
            select: selectFields,
          }
        )
      : await supabaseSelect('pos_payment_attempts', {
          order: 'created_at.desc',
          limit,
          select: selectFields,
        })) as {
      id?: number
      order_id?: number | null
      local_tx_id?: string
      provider?: string
      mode?: string
      tx_code?: string
      retry_of_attempt_id?: number | null
      retry_of_local_tx_id?: string | null
      bank_id?: string
      request_amount?: number
      approved_amount?: number
      response_code?: string
      approval_code?: string
      trace_no?: string
      terminal_id?: string
      merchant_id?: string
      response_text?: string
      status?: string
      error_reason?: string
      created_at?: string
      pos_orders?: { order_no?: string; store_code?: string; total?: number } | { order_no?: string; store_code?: string; total?: number }[] | null
    }[] | null)

    const mapped = (rows || []).map((r) => {
      const joined = Array.isArray(r.pos_orders) ? r.pos_orders[0] : r.pos_orders
      return {
        id: Number(r.id) || 0,
        orderId: r.order_id != null ? Number(r.order_id) : null,
        orderNo: String(joined?.order_no ?? ''),
        storeCode: String(joined?.store_code ?? ''),
        localTxId: String(r.local_tx_id ?? ''),
        provider: String(r.provider ?? ''),
        mode: String(r.mode ?? ''),
        txCode: String(r.tx_code ?? ''),
        retryOfAttemptId: r.retry_of_attempt_id != null ? Number(r.retry_of_attempt_id) : null,
        retryOfLocalTxId: String(r.retry_of_local_tx_id ?? ''),
        bankId: String(r.bank_id ?? ''),
        requestAmount: Number(r.request_amount ?? 0),
        approvedAmount: Number(r.approved_amount ?? 0),
        responseCode: String(r.response_code ?? ''),
        approvalCode: String(r.approval_code ?? ''),
        traceNo: String(r.trace_no ?? ''),
        terminalId: String(r.terminal_id ?? ''),
        merchantId: String(r.merchant_id ?? ''),
        responseText: String(r.response_text ?? ''),
        status: String(r.status ?? ''),
        errorReason: String(r.error_reason ?? ''),
        createdAt: String(r.created_at ?? ''),
      }
    })

    const filteredByStore =
      storeCode && storeCode !== 'All'
        ? mapped.filter((x) => String(x.storeCode || '').trim() === storeCode)
        : mapped

    return NextResponse.json(filteredByStore, { headers })
  } catch (e) {
    console.error('getPosPaymentAttempts:', e)
    return NextResponse.json([], { headers })
  }
}

