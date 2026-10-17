/**
 * 카운터 POS KBank QR 승인 후 status 마감이 빠진 주문 보정 (서버 전용).
 * 순수 판정·패치는 pos-kbank-counter-qr-finalize-shared (클라이언트 안전).
 */
import 'server-only'

import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  resolveCounterKbankQrFinalizePatch,
} from '@/lib/pos-kbank-counter-qr-finalize-shared'

export type {
  CounterKbankQrCloseStatus,
  CounterKbankQrFinalizePatchInput,
  CounterKbankQrFinalizePatchResult,
} from '@/lib/pos-kbank-counter-qr-finalize-shared'

export {
  isPosOrderFullyPaidButOpen,
  resolveCounterKbankQrCloseStatus,
  resolveCounterKbankQrFinalizePatch,
} from '@/lib/pos-kbank-counter-qr-finalize-shared'

export type FinalizeCounterPosKbankQrOrderResult = {
  ok: boolean
  alreadyPaid?: boolean
  status?: string
  tableName?: string
  storeCode?: string
  orderType?: string
  orderId?: number
  message?: string
}

export async function finalizeCounterPosKbankQrOrder(params: {
  orderId: number
  paymentQrAmount?: number
}): Promise<FinalizeCounterPosKbankQrOrderResult> {
  const orderId = Math.floor(Number(params.orderId) || 0)
  if (!(orderId > 0)) return { ok: false, message: 'invalid_order_id' }

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select:
      'id,order_no,store_code,status,order_type,table_name,total,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,payment_crypto,paid_at',
  })) as Array<{
    id?: number
    store_code?: string | null
    status?: string | null
    order_type?: string | null
    table_name?: string | null
    total?: number | null
    payment_cash?: number | null
    payment_card?: number | null
    payment_qr?: number | null
    payment_other?: number | null
    payment_delivery_app?: number | null
    payment_crypto?: number | null
    paid_at?: string | null
  }>

  const order = rows?.[0]
  if (!order?.id) return { ok: false, message: 'order_not_found' }

  const resolved = resolveCounterKbankQrFinalizePatch({
    status: String(order.status || ''),
    orderType: order.order_type,
    total: Number(order.total) || 0,
    paymentCash: Number(order.payment_cash) || 0,
    paymentCard: Number(order.payment_card) || 0,
    paymentQr: Number(order.payment_qr) || 0,
    paymentOther: Number(order.payment_other) || 0,
    paymentDeliveryApp: Number(order.payment_delivery_app) || 0,
    paymentCrypto: Number(order.payment_crypto) || 0,
    paidAt: order.paid_at ?? null,
    bankAmount: Number(params.paymentQrAmount) || 0,
  })

  const baseMeta = {
    orderId,
    tableName: String(order.table_name || '').trim(),
    storeCode: String(order.store_code || '').trim(),
    orderType: String(order.order_type || '').trim(),
  }

  if (resolved.alreadyPaid) {
    return {
      ok: true,
      alreadyPaid: true,
      status: String(order.status || ''),
      ...baseMeta,
    }
  }

  await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, resolved.patch)

  return {
    ok: true,
    alreadyPaid: false,
    status: resolved.closeStatus,
    ...baseMeta,
  }
}
