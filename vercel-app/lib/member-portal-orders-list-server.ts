import type { MemberSummary } from '@/lib/members-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type MemberPortalOrderListRow = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pointUsed: number
  paymentQr: number
  pickupHint: string
  createdAt: string
  paidAt: string | null
  awaitingPayment: boolean
  paymentExpired: boolean
  paymentExpiresAt: string | null
}

import {
  MEMBER_PORTAL_PAYMENT_EXPIRED_TAG,
  MEMBER_PORTAL_PAYMENT_PENDING_TAG,
} from '@/lib/member-portal-payment-pending'
import { MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS } from '@/lib/member-portal-prepay-config'

function parsePickupHint(memo: string): string {
  const m = /픽업희망:([^·]+)/u.exec(String(memo || ''))
  return m?.[1]?.trim() || ''
}

export async function listMemberPortalOrders(
  member: MemberSummary,
  limit = 15
): Promise<MemberPortalOrderListRow[]> {
  const memberId = Number(member.id || 0)
  if (!memberId) return []

  const rows = (await supabaseSelectFilter('pos_orders', `member_id=eq.${memberId}`, {
    limit: Math.min(50, Math.max(1, limit)),
    order: 'created_at.desc',
    select:
      'id,order_no,store_code,status,total,point_used,payment_qr,memo,created_at,paid_at,created_by',
  })) as Array<{
    id?: number
    order_no?: string
    store_code?: string
    status?: string
    total?: number
    point_used?: number | null
    payment_qr?: number | null
    memo?: string | null
    created_at?: string | null
    paid_at?: string | null
    created_by?: string | null
  }>

  return (rows || [])
    .filter((r) => String(r.created_by || '').startsWith('member_portal:'))
    .map((r) => {
      const memo = String(r.memo || '')
      const status = String(r.status || 'pending').trim().toLowerCase()
      const total = Math.max(0, Number(r.total || 0))
      const paymentQr = Math.max(0, Number(r.payment_qr || 0))
      const paymentExpired =
        (status === 'cancelled' || status === 'canceled') && memo.includes(MEMBER_PORTAL_PAYMENT_EXPIRED_TAG)
      const awaitingPayment =
        !paymentExpired &&
        status === 'pending' &&
        memo.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG) &&
        paymentQr <= 0.0001 &&
        total > 0.0001

      const createdAt = String(r.created_at || '')
      let paymentExpiresAt: string | null = null
      if (awaitingPayment && createdAt) {
        const createdMs = new Date(createdAt).getTime()
        if (Number.isFinite(createdMs)) {
          paymentExpiresAt = new Date(createdMs + MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS).toISOString()
        }
      }

      return {
        orderId: Number(r.id || 0),
        orderNo: String(r.order_no || ''),
        storeCode: String(r.store_code || ''),
        status,
        total,
        pointUsed: Math.max(0, Math.trunc(Number(r.point_used || 0))),
        paymentQr,
        pickupHint: parsePickupHint(memo),
        createdAt,
        paidAt: r.paid_at ? String(r.paid_at) : null,
        awaitingPayment,
        paymentExpired,
        paymentExpiresAt,
      }
    })
    .filter((r) => r.orderId > 0)
}

export function memberPortalOrderStatusLabelKey(
  row: Pick<MemberPortalOrderListRow, 'status' | 'awaitingPayment' | 'paymentExpired'>
):
  | 'orderStatusAwaitingPayment'
  | 'orderStatusPaid'
  | 'orderStatusCooking'
  | 'orderStatusReady'
  | 'orderStatusPending'
  | 'orderStatusCompleted'
  | 'orderStatusCancelled'
  | 'orderStatusExpired' {
  if (row.awaitingPayment) return 'orderStatusAwaitingPayment'
  if (row.paymentExpired) return 'orderStatusExpired'
  const s = String(row.status || '').toLowerCase()
  if (s === 'completed') return 'orderStatusCompleted'
  if (s === 'ready') return 'orderStatusReady'
  if (s === 'cooking' || s === 'preparing') return 'orderStatusCooking'
  if (s === 'paid') return 'orderStatusPaid'
  if (s === 'cancelled' || s === 'canceled') return 'orderStatusCancelled'
  return 'orderStatusPending'
}
