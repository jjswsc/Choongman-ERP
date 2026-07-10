import { pushLineTextMessage } from '@/lib/line-messaging-server'
import { formatMemberPointsDisplay } from '@/lib/member-points-math'
import { isMemberPointLineNotifyEnabled } from '@/lib/member-point-line-notify-settings'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const BRAND_NAME = 'Choongman Chicken'

async function resolveMemberLineUserId(memberId: number): Promise<string> {
  const rows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&member_id=eq.${memberId}`,
    { limit: 1, select: 'provider_user_id' }
  )) as Array<{ provider_user_id?: string | null }>
  return String(rows?.[0]?.provider_user_id || '').trim()
}

export function buildMemberPointLineNotifyText(params: {
  earned: number
  used: number
  balanceAfter: number
  tierCode: string
  storeCode?: string
  orderNo?: string
}): string {
  const lines: string[] = [BRAND_NAME]
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (earned > 0) {
    lines.push(`ได้รับพอยท์ +${formatMemberPointsDisplay(earned)}`)
  }
  if (used > 0) {
    lines.push(`ใช้พอยท์ -${formatMemberPointsDisplay(used)}`)
  }
  lines.push(`พอยท์คงเหลือ ${formatMemberPointsDisplay(params.balanceAfter)}`)
  const tier = String(params.tierCode || '').trim()
  if (tier) lines.push(`ระดับสมาชิก ${tier}`)
  const storeCode = String(params.storeCode || '').trim()
  const orderNo = String(params.orderNo || '').trim()
  const tail = [storeCode, orderNo].filter(Boolean).join(' · ')
  if (tail) lines.push(tail)
  return lines.join('\n').slice(0, 5000)
}

/** POS·회원앱 결제 후 포인트 적립/사용 시 LINE 텍스트 push (실패해도 주문 처리는 유지) */
export async function notifyMemberPointLineOnOrder(params: {
  memberId: number
  earned: number
  used: number
  balanceAfter: number
  tierCode: string
  storeCode?: string
  orderNo?: string
}): Promise<void> {
  const memberId = Number(params.memberId || 0)
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (!memberId || (earned <= 0 && used <= 0)) return

  const enabled = await isMemberPointLineNotifyEnabled()
  if (!enabled) return

  const lineUserId = await resolveMemberLineUserId(memberId)
  if (!lineUserId) return

  const text = buildMemberPointLineNotifyText(params)
  const result = await pushLineTextMessage({ userId: lineUserId, text })
  if (!result.ok) {
    console.warn('member-point-line-notify:', result.message || 'push_failed', { memberId })
  }
}
