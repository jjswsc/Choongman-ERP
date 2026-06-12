import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS } from '@/lib/member-portal-prepay-config'
import {
  MEMBER_PORTAL_PAYMENT_EXPIRED_TAG,
  MEMBER_PORTAL_PAYMENT_PENDING_TAG,
} from '@/lib/member-portal-payment-pending'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

export async function expireStaleMemberPortalPendingPayments(): Promise<{
  scanned: number
  expired: number
  orderIds: number[]
}> {
  const cutoffMs = Date.now() - MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS
  const cutoffIso = new Date(cutoffMs).toISOString()

  const rows = (await supabaseSelectFilter(
    'pos_orders',
    `status=eq.pending&created_at=lt.${encodeURIComponent(cutoffIso)}`,
    {
      limit: 200,
      order: 'created_at.asc',
      select: 'id,memo,created_by,status,payment_qr,created_at',
    }
  )) as Array<{
    id?: number
    memo?: string | null
    created_by?: string | null
    status?: string
    payment_qr?: number | null
    created_at?: string | null
  }>

  const orderIds: number[] = []
  for (const row of rows || []) {
    const id = Number(row.id || 0)
    if (!id) continue
    const createdBy = String(row.created_by || '')
    if (!createdBy.startsWith('member_portal:')) continue
    const memo = String(row.memo || '')
    if (!memo.includes(MEMBER_PORTAL_PAYMENT_PENDING_TAG)) continue
    if (Number(row.payment_qr || 0) > 0.0001) continue

    const nextMemo = memo.includes(MEMBER_PORTAL_PAYMENT_EXPIRED_TAG)
      ? memo
      : `${memo} · ${MEMBER_PORTAL_PAYMENT_EXPIRED_TAG}`

    await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
      status: 'cancelled',
      memo: nextMemo,
      updated_at: getBangkokDateTimeString(),
    })
    orderIds.push(id)
  }

  return {
    scanned: (rows || []).length,
    expired: orderIds.length,
    orderIds,
  }
}
