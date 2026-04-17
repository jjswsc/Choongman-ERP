import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { syncReceivableToOutboundView } from '@/lib/receivable-match-outbound'
import { syncReceivableFromForceOutboundStockLogById } from '@/lib/force-outbound-receivable'

/**
 * 출고 이력(stock_logs) 확정 단가·수량 수정. orders.cart_json 은 변경하지 않음.
 * log_type: Outbound | ForceOutbound 만 허용. qty 부호는 기존 행과 동일하게 유지.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }

    const body = (await request.json()) as {
      stockLogId?: number | string
      invoiceUnitPrice?: number | string
      /** 절대수량(양수). 생략 시 단가만 변경(하위 호환) */
      qtyAbs?: number | string
    }
    const stockLogId = Number(body?.stockLogId)
    const invoiceUnitPrice = Number(body?.invoiceUnitPrice)
    const qtyAbsRaw = body?.qtyAbs
    const qtyAbs =
      qtyAbsRaw === undefined || qtyAbsRaw === null || String(qtyAbsRaw).trim() === ''
        ? undefined
        : Number(qtyAbsRaw)

    if (!Number.isFinite(stockLogId) || stockLogId <= 0) {
      return NextResponse.json({ success: false, message: '유효한 출고 로그 ID가 필요합니다.' }, { headers })
    }
    if (!Number.isFinite(invoiceUnitPrice) || invoiceUnitPrice < 0 || invoiceUnitPrice > 1e12) {
      return NextResponse.json({ success: false, message: '단가는 0 이상의 유효한 숫자여야 합니다.' }, { headers })
    }

    const filter = `id=eq.${encodeURIComponent(String(stockLogId))}`
    const rows = (await supabaseSelectFilter('stock_logs', filter, {
      select: 'id,log_type,qty,order_id',
      limit: 1,
    })) as { id?: number; log_type?: string; qty?: number | string; order_id?: number | null }[]

    const row = rows?.[0]
    const lt = String(row?.log_type || '')
    if (!row || (lt !== 'Outbound' && lt !== 'ForceOutbound')) {
      return NextResponse.json(
        { success: false, message: '주문/강제 출고 로그만 수정할 수 있습니다.' },
        { headers }
      )
    }

    const patch: Record<string, unknown> = { invoice_unit_price: invoiceUnitPrice }

    if (qtyAbs !== undefined) {
      if (!Number.isFinite(qtyAbs) || qtyAbs <= 0 || qtyAbs > 1e9) {
        return NextResponse.json(
          { success: false, message: '수량은 0보다 큰 유효한 숫자여야 합니다.' },
          { headers }
        )
      }
      const curQ = Number(row.qty)
      const sign = curQ < 0 ? -1 : curQ > 0 ? 1 : -1
      patch.qty = sign * Math.abs(qtyAbs)
    }

    await supabaseUpdate('stock_logs', stockLogId, patch)

    const receivableSync: { ran: boolean; ok?: boolean; message?: string } = { ran: false }
    if (lt === 'Outbound') {
      const oid = row.order_id != null ? Number(row.order_id) : NaN
      if (Number.isFinite(oid) && oid > 0) {
        receivableSync.ran = true
        try {
          const syncR = await syncReceivableToOutboundView(oid)
          receivableSync.ok = syncR.ok
          receivableSync.message = syncR.message
        } catch (err) {
          receivableSync.ok = false
          receivableSync.message = err instanceof Error ? err.message : '미수금 동기화 오류'
        }
      }
    } else if (lt === 'ForceOutbound') {
      receivableSync.ran = true
      try {
        await syncReceivableFromForceOutboundStockLogById(stockLogId)
        receivableSync.ok = true
        receivableSync.message = '강제출고 미수금 반영'
      } catch (err) {
        receivableSync.ok = false
        receivableSync.message = err instanceof Error ? err.message : '미수금 동기화 오류'
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: '저장되었습니다.',
        receivableSync,
      },
      { headers }
    )
  } catch (e) {
    console.error('patchStockLogInvoiceUnitPrice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
