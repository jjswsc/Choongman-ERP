import type { MemberSummary } from '@/lib/members-server'
import { parseMemberPortalOrderItemsJson } from '@/lib/member-portal-order-items-parse'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type MemberPortalOrderDetail = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pickupHint: string
  createdAt: string
  items: ReturnType<typeof parseMemberPortalOrderItemsJson>
}

function parsePickupHint(memo: string): string {
  const m = /픽업희망:([^·]+)/u.exec(String(memo || ''))
  return m?.[1]?.trim() || ''
}

export async function getMemberPortalOrderDetail(
  member: MemberSummary,
  orderId: number
): Promise<MemberPortalOrderDetail | null> {
  const memberId = Number(member.id || 0)
  if (!memberId || !orderId) return null

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,member_id,order_no,store_code,status,total,memo,created_at,items_json',
  })) as Array<{
    id?: number
    member_id?: number | null
    order_no?: string
    store_code?: string
    status?: string
    total?: number
    memo?: string | null
    created_at?: string | null
    items_json?: string | null
  }>

  const order = rows?.[0]
  if (!order?.id || Number(order.member_id || 0) !== memberId) return null

  return {
    orderId: Number(order.id),
    orderNo: String(order.order_no || ''),
    storeCode: String(order.store_code || ''),
    status: String(order.status || 'pending').trim().toLowerCase(),
    total: Math.max(0, Number(order.total || 0)),
    pickupHint: parsePickupHint(String(order.memo || '')),
    createdAt: String(order.created_at || ''),
    items: parseMemberPortalOrderItemsJson(order.items_json),
  }
}
