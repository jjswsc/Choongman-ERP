import { pushLineTextMessage } from '@/lib/line-messaging-server'
import { isMemberPortalPickupLineNotifyEnabled } from '@/lib/member-portal-pickup-settings'
import { resolveMemberPortalTakeoutMeta } from '@/lib/pos-member-portal-takeout-label'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type PosOrderNotifyRow = {
  id?: number
  order_no?: string
  store_code?: string
  status?: string
  memo?: string | null
  member_id?: number | null
  member_no?: string | null
  table_name?: string | null
  created_by?: string | null
}

/** POS에서 ready 전환 시 회원앱 픽업 주문에 LINE 푸시 (실패해도 상태 변경은 유지) */
export async function notifyMemberPortalPickupReady(orderId: number): Promise<void> {
  const id = Math.trunc(Number(orderId || 0))
  if (!id) return

  const enabled = await isMemberPortalPickupLineNotifyEnabled()
  if (!enabled) return

  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
    limit: 1,
    select: 'id,order_no,store_code,status,memo,member_id,member_no,table_name,created_by',
  })) as PosOrderNotifyRow[]
  const order = rows?.[0]
  if (!order?.id) return

  const status = String(order.status || '').trim().toLowerCase()
  if (status !== 'ready') return

  const meta = resolveMemberPortalTakeoutMeta({
    memo: order.memo,
    memberId: order.member_id,
    memberNo: order.member_no,
    tableName: order.table_name,
  })
  if (!meta.isMemberPortal) return
  if (!String(order.created_by || '').startsWith('member_portal:')) return

  const memberId = Math.trunc(Number(order.member_id || 0))
  if (!memberId) return

  const identityRows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&member_id=eq.${memberId}`,
    { limit: 1, select: 'provider_user_id' }
  )) as Array<{ provider_user_id?: string | null }>
  const lineUserId = String(identityRows?.[0]?.provider_user_id || '').trim()
  if (!lineUserId) return

  const orderNo = String(order.order_no || `POS-${id}`).trim()
  const storeCode = String(order.store_code || '').trim()
  const memberName = meta.memberName || meta.memberNo || ''
  const pickupHint = meta.pickupAtRaw ? ` · ${meta.pickupAtRaw}` : ''
  const text = [
    '픽업 준비가 완료되었습니다.',
    memberName ? `${memberName}님` : '',
    `${orderNo}${storeCode ? ` (${storeCode})` : ''}${pickupHint}`,
    '매장에서 수령해 주세요.',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await pushLineTextMessage({ userId: lineUserId, text })
  if (!result.ok) {
    console.warn('member-portal-pickup-notify:', result.message || 'push_failed', { orderId: id })
  }
}
