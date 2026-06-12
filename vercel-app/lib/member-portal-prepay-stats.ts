import { MEMBER_PORTAL_PAYMENT_EXPIRED_TAG, MEMBER_PORTAL_PAYMENT_PENDING_TAG } from '@/lib/member-portal-payment-pending'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type MemberPortalPrepayStats = {
  days: number
  totalOrders: number
  paidOrders: number
  expiredOrders: number
  awaitingPayment: number
  pointsOnlyPaid: number
  qrPaid: number
  conversionRate: number
}

export async function loadMemberPortalPrepayStats(days = 7): Promise<MemberPortalPrepayStats> {
  const span = Math.min(30, Math.max(1, Math.trunc(days)))
  const since = new Date(Date.now() - span * 24 * 60 * 60 * 1000).toISOString()

  const rows = (await supabaseSelectFilter(
    'pos_orders',
    `created_at=gte.${encodeURIComponent(since)}`,
    {
      limit: 5000,
      order: 'created_at.desc',
      select: 'id,status,memo,total,point_used,payment_qr,created_by,paid_at',
    }
  )) as Array<{
    status?: string
    memo?: string | null
    total?: number
    point_used?: number | null
    payment_qr?: number | null
    created_by?: string | null
    paid_at?: string | null
  }>

  let totalOrders = 0
  let paidOrders = 0
  let expiredOrders = 0
  let awaitingPayment = 0
  let pointsOnlyPaid = 0
  let qrPaid = 0

  for (const row of rows || []) {
    if (!String(row.created_by || '').startsWith('member_portal:')) continue
    if (!String(row.memo || '').includes('[회원주문]')) continue
    totalOrders += 1
    const memo = String(row.memo || '')
    const status = String(row.status || '').trim().toLowerCase()
    const total = Math.max(0, Number(row.total || 0))
    const paymentQr = Math.max(0, Number(row.payment_qr || 0))
    const pointUsed = Math.max(0, Math.trunc(Number(row.point_used || 0)))

    if (memo.includes(MEMBER_PORTAL_PAYMENT_EXPIRED_TAG) && (status === 'cancelled' || status === 'canceled')) {
      expiredOrders += 1
      continue
    }
    if (
      status === 'pending' &&
      memo.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG) &&
      paymentQr <= 0.0001 &&
      total > 0.0001
    ) {
      awaitingPayment += 1
      continue
    }
    if (status === 'paid' || status === 'completed' || row.paid_at) {
      paidOrders += 1
      if (paymentQr > 0.0001) qrPaid += 1
      else if (pointUsed > 0 || total <= 0.0001) pointsOnlyPaid += 1
      else qrPaid += 1
    }
  }

  const conversionRate =
    totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 1000) / 10 : 0

  return {
    days: span,
    totalOrders,
    paidOrders,
    expiredOrders,
    awaitingPayment,
    pointsOnlyPaid,
    qrPaid,
    conversionRate,
  }
}
