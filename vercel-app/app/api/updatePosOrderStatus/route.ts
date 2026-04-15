import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { processPosStockDeduction, reversePosStockDeduction } from '@/lib/pos-stock-deduction'
import {
  hasJournalForSource,
  postPosOrderJournal,
  postPosOrderReversalJournal,
} from '@/lib/accounting-posting'
import {
  isPosCompletionStatus,
  isPosPaidLikeStatus,
  isPosReversalStatus,
  resolveBangkokAccountingDate,
} from '@/lib/pos-order-policy'
import { upsertPosVatLedgerDraft } from '@/lib/pos-ledger-drafts'

const ALLOWED_STATUSES = ['pending', 'paid', 'cooking', 'ready', 'completed', 'cancelled', 'refunded']

/** POS 주문 상태 변경 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body.id != null ? Number(body.id) : NaN
    const status = String(body.status ?? '').trim()

    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '주문 ID가 필요합니다.' }, { headers })
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
      limit: 1,
      select:
        'id,order_no,store_code,total,subtotal,vat,status,created_at,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,created_by',
    })) as {
      id?: number
      order_no?: string
      store_code?: string
      total?: number
      subtotal?: number
      vat?: number
      status?: string
      created_at?: string
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_delivery_app?: number
      created_by?: string
    }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }
    const prev = existing[0]
    const prevStatus = String(prev?.status ?? '').trim().toLowerCase()
    const nextStatus = String(status).trim().toLowerCase()
    if (isPosReversalStatus(prevStatus) && isPosCompletionStatus(nextStatus)) {
      return NextResponse.json(
        { success: false, message: '취소/환불된 주문은 완료 상태로 되돌릴 수 없습니다.' },
        { status: 409, headers }
      )
    }
    if (isPosCompletionStatus(prevStatus) && !isPosCompletionStatus(nextStatus) && !isPosReversalStatus(nextStatus)) {
      return NextResponse.json(
        { success: false, message: '완료 주문은 취소/환불 상태로만 변경할 수 있습니다.' },
        { status: 409, headers }
      )
    }

    await supabaseUpdate('pos_orders', id, { status })

    const storeCode = String(prev?.store_code ?? '').trim()
    const salesDate = resolveBangkokAccountingDate(String(prev?.created_at ?? ''))
    if (isPosCompletionStatus(nextStatus)) {
      if (storeCode) {
        try {
          const settings = (await supabaseSelectFilter(
            'pos_printer_settings',
            `store_code=eq.${encodeURIComponent(storeCode)}`,
            { limit: 1, select: 'auto_stock_deduction' }
          )) as { auto_stock_deduction?: boolean }[] | null
          if (settings?.[0]?.auto_stock_deduction) {
            await processPosStockDeduction(id)
          }
        } catch (e) {
          console.error('processPosStockDeduction:', e)
        }
      }

      const total = Number(prev?.total || 0)
      const vat = Number(prev?.vat || 0)
      const subtotal = Number(prev?.subtotal || Math.max(0, total - vat))
      const orderNo = String(prev?.order_no || `POS-${id}`)
      try {
        const alreadyPosted = await hasJournalForSource('pos_order', id)
        if (!alreadyPosted) {
          await postPosOrderJournal({
            posOrderId: id,
            salesDate,
            total,
            vatAmount: vat,
            paymentCash: Number(prev?.payment_cash || 0),
            paymentCard: Number(prev?.payment_card || 0),
            paymentQr: Number(prev?.payment_qr || 0),
            paymentOther: Number(prev?.payment_other || 0),
            paymentDeliveryApp: Number(prev?.payment_delivery_app || 0),
            storeName: storeCode || undefined,
            memo: 'POS 주문 완료 자동분개',
          })
        }
      } catch (postingErr) {
        console.error('updatePosOrderStatus posting:', postingErr)
      }
      try {
        await upsertPosVatLedgerDraft({
          posOrderId: id,
          orderNo,
          storeCode,
          createdAtIso: String(prev?.created_at ?? ''),
          subtotal,
          total,
          vatAmount: vat,
          createdBy: String(prev?.created_by ?? ''),
        })
      } catch (vatErr) {
        console.error('updatePosOrderStatus vat draft:', vatErr)
      }
    } else if (isPosReversalStatus(nextStatus) && isPosPaidLikeStatus(prevStatus)) {
      try {
        await reversePosStockDeduction(id)
      } catch (e) {
        console.error('reversePosStockDeduction:', e)
      }
      try {
        await postPosOrderReversalJournal({
          posOrderId: id,
          salesDate,
          storeName: storeCode || undefined,
          memo: `POS 주문 ${nextStatus === 'refunded' ? '환불' : '취소'} 역분개`,
        })
      } catch (postingErr) {
        console.error('updatePosOrderStatus reversal posting:', postingErr)
      }
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosOrderStatus:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 503, headers })
  }
}
