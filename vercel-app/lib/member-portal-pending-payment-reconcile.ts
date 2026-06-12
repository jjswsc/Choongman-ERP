import { finalizeMemberPortalPrepaidOrder } from '@/lib/member-portal-checkout-server'
import { checkKbankQrStatus } from '@/lib/payments/kbank-client'
import { normalizeKbankTxnStatusToPos } from '@/lib/payments/kbank-api-reference'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function reconcileStaleMemberPortalQrPayments(): Promise<{
  scanned: number
  recovered: number
  orderIds: number[]
}> {
  const cutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const attempts = (await supabaseSelectFilter(
    'pos_payment_attempts',
    `status=eq.pending&provider=eq.kbank_qr_api&created_at=lt.${encodeURIComponent(cutoffIso)}`,
    {
      limit: 100,
      order: 'created_at.asc',
      select: 'id,order_id,local_tx_id,request_amount,created_at',
    }
  )) as Array<{
    id?: number
    order_id?: number | null
    local_tx_id?: string | null
    request_amount?: number | null
  }>

  const orderIds: number[] = []
  for (const attempt of attempts || []) {
    const orderId = Number(attempt.order_id || 0)
    const partnerTransactionId = String(attempt.local_tx_id || '').trim()
    if (!orderId || !partnerTransactionId) continue

    const orders = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
      limit: 1,
      select: 'id,status,created_by,memo',
    })) as Array<{ id?: number; status?: string; created_by?: string | null; memo?: string | null }>
    const order = orders?.[0]
    if (!order?.id) continue
    if (!String(order.created_by || '').startsWith('member_portal:')) continue
    const status = String(order.status || '').trim().toLowerCase()
    if (status === 'paid' || status === 'completed' || status === 'cancelled' || status === 'canceled') {
      continue
    }

    try {
      const result = await checkKbankQrStatus({
        orderId,
        partnerTransactionId,
        originalTransactionId: partnerTransactionId,
        payload: { origPartnerTxnUid: partnerTransactionId },
      })
      const response =
        result.response && typeof result.response === 'object'
          ? (result.response as Record<string, unknown>)
          : {}
      const statusLabel = normalizeKbankTxnStatusToPos(
        response.txnStatus ?? response.status,
        response.statusCode
      )
      if (statusLabel !== 'approved') continue

      const amount = Math.max(
        0,
        Number(response.txnAmount ?? response.amount ?? attempt.request_amount ?? 0)
      )
      await finalizeMemberPortalPrepaidOrder({
        orderId,
        paymentQr: amount,
        partnerTransactionId,
      })
      orderIds.push(orderId)
    } catch {
      /* next attempt */
    }
  }

  return {
    scanned: (attempts || []).length,
    recovered: orderIds.length,
    orderIds,
  }
}
