import { buildMemberPointLineFlexMessage } from '@/lib/member-point-line-flex'
import { pushLineMessages, pushLineTextMessage } from '@/lib/line-messaging-server'
import { formatMemberPointsDisplay, roundMemberPointsEarn } from '@/lib/member-points-math'
import { isMemberPointLineNotifyEnabled } from '@/lib/member-point-line-notify-settings'
import { createMemberEvent } from '@/lib/members-server-core'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const BRAND_NAME = 'Choongman Chicken'

async function resolveMemberLineUserId(memberId: number): Promise<string> {
  const base = `provider=eq.line&member_id=eq.${memberId}`
  const activeRows = (await supabaseSelectFilter('member_identities', `${base}&status=eq.active`, {
    limit: 1,
    select: 'provider_user_id',
  })) as Array<{ provider_user_id?: string | null }>
  const active = String(activeRows?.[0]?.provider_user_id || '').trim()
  if (active) return active
  const rows = (await supabaseSelectFilter('member_identities', base, {
    limit: 1,
    select: 'provider_user_id',
  })) as Array<{ provider_user_id?: string | null }>
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

async function wasPointLineNotifySent(orderId: number): Promise<boolean> {
  try {
    const eventId = `point_line_notify:order:${orderId}`
    const rows = (await supabaseSelectFilter(
      'member_events',
      `event_id=eq.${encodeURIComponent(eventId)}`,
      { limit: 1, select: 'id' }
    )) as Array<{ id?: number }>
    return Boolean(rows?.[0]?.id)
  } catch {
    return false
  }
}

async function markPointLineNotifySent(orderId: number, memberId: number): Promise<void> {
  try {
    await createMemberEvent({
      eventId: `point_line_notify:order:${orderId}`,
      eventType: 'point_line_notify',
      memberId,
      payload: { orderId },
      status: 'processed',
    })
  } catch {
    /* ignore duplicate race */
  }
}

async function resolveOrderPointNotifyAmounts(orderId: number): Promise<{ earned: number; used: number }> {
  const id = Number(orderId || 0)
  if (!id) return { earned: 0, used: 0 }
  let earned = 0
  let used = 0
  try {
    const ledger = (await supabaseSelectFilter('member_points_ledger', `order_id=eq.${id}`, {
      limit: 20,
      select: 'kind,points',
    })) as Array<{ kind?: string; points?: number | null }>
    for (const row of ledger || []) {
      const kind = String(row.kind || '').trim().toLowerCase()
      const pts = roundMemberPointsEarn(row.points)
      if (kind === 'earn' && pts > 0) earned = pts
      if (kind === 'use' && pts !== 0) used = Math.abs(pts)
    }
  } catch {
    /* ledger optional */
  }
  if (earned > 0 || used > 0) return { earned, used }
  try {
    const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
      limit: 1,
      select: 'point_earned,point_used',
    })) as Array<{ point_earned?: number | null; point_used?: number | null }>
    const order = rows?.[0]
    return {
      earned: roundMemberPointsEarn(order?.point_earned),
      used: roundMemberPointsEarn(order?.point_used),
    }
  } catch {
    return { earned: 0, used: 0 }
  }
}

export async function getMemberPointLineNotifyReadiness(memberId: number): Promise<{
  notifyEnabled: boolean
  lineTokenConfigured: boolean
  lineUserId: string
  lineLinked: boolean
  lineOaFriend: boolean
  memberName: string
  pointBalance: number
  tierCode: string
}> {
  const id = Number(memberId || 0)
  const lineTokenConfigured = Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim())
  const notifyEnabled = await isMemberPointLineNotifyEnabled()
  if (!id) {
    return {
      notifyEnabled,
      lineTokenConfigured,
      lineUserId: '',
      lineLinked: false,
      lineOaFriend: false,
      memberName: '',
      pointBalance: 0,
      tierCode: '',
    }
  }
  const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, {
    limit: 1,
    select: 'name,full_name,point_balance,tier_code,line_oa_friend',
  })) as Array<{
    name?: string
    full_name?: string
    point_balance?: number | null
    tier_code?: string | null
    line_oa_friend?: boolean | null
  }>
  const member = rows?.[0]
  const lineUserId = await resolveMemberLineUserId(id)
  return {
    notifyEnabled,
    lineTokenConfigured,
    lineUserId,
    lineLinked: Boolean(lineUserId),
    lineOaFriend: Boolean(member?.line_oa_friend),
    memberName: String(member?.full_name || member?.name || '').trim(),
    pointBalance: roundMemberPointsEarn(member?.point_balance),
    tierCode: String(member?.tier_code || '').trim(),
  }
}

async function deliverMemberPointLineNotify(params: {
  memberId: number
  earned: number
  used: number
  balanceAfter: number
  tierCode: string
  storeCode?: string
  orderNo?: string
}): Promise<{ ok: boolean; channel?: 'flex' | 'text'; message?: string }> {
  const lineUserId = await resolveMemberLineUserId(params.memberId)
  if (!lineUserId) return { ok: false, message: 'no_line_identity' }

  const flex = buildMemberPointLineFlexMessage(params)
  const flexResult = await pushLineMessages({
    userId: lineUserId,
    messages: [{ type: 'flex', altText: flex.altText, contents: flex.contents }],
  })
  if (flexResult.ok) return { ok: true, channel: 'flex' }

  const text = buildMemberPointLineNotifyText(params)
  const textResult = await pushLineTextMessage({ userId: lineUserId, text })
  if (textResult.ok) return { ok: true, channel: 'text' }
  return { ok: false, message: textResult.message || flexResult.message || 'push_failed' }
}

/** 결제 완료 주문 — 원장/주문 기준으로 LINE 알림 1회 (member_events로 중복 방지) */
export async function notifyMemberPointLineForPaidOrder(params: {
  orderId: number
  memberId: number
  storeCode?: string
  orderNo?: string
}): Promise<{ sent: boolean; reason?: string }> {
  const orderId = Number(params.orderId || 0)
  const memberId = Number(params.memberId || 0)
  if (!orderId || !memberId) return { sent: false, reason: 'missing_ids' }

  const enabled = await isMemberPointLineNotifyEnabled()
  if (!enabled) return { sent: false, reason: 'disabled' }

  const { earned, used } = await resolveOrderPointNotifyAmounts(orderId)
  if (earned <= 0 && used <= 0) return { sent: false, reason: 'no_points' }

  if (await wasPointLineNotifySent(orderId)) {
    return { sent: false, reason: 'already_sent' }
  }

  const memberRows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, {
    limit: 1,
    select: 'point_balance,tier_code',
  })) as Array<{ point_balance?: number | null; tier_code?: string | null }>
  const member = memberRows?.[0]
  if (!member) return { sent: false, reason: 'member_not_found' }

  const result = await deliverMemberPointLineNotify({
    memberId,
    earned,
    used,
    balanceAfter: roundMemberPointsEarn(member.point_balance),
    tierCode: String(member.tier_code || '').trim(),
    storeCode: params.storeCode,
    orderNo: params.orderNo,
  })
  if (!result.ok) {
    console.warn('member-point-line-notify: push_failed', {
      orderId,
      memberId,
      message: result.message || 'push_failed',
    })
    return { sent: false, reason: result.message || 'push_failed' }
  }
  await markPointLineNotifySent(orderId, memberId)
  return { sent: true, reason: result.channel }
}

/** @deprecated 내부 호환 — notifyMemberPointLineForPaidOrder 사용 */
export async function notifyMemberPointLineOnOrder(params: {
  memberId: number
  earned: number
  used: number
  balanceAfter: number
  tierCode: string
  storeCode?: string
  orderNo?: string
  orderId?: number
}): Promise<void> {
  if (params.orderId) {
    await notifyMemberPointLineForPaidOrder({
      orderId: params.orderId,
      memberId: params.memberId,
      storeCode: params.storeCode,
      orderNo: params.orderNo,
    })
    return
  }
  const memberId = Number(params.memberId || 0)
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (!memberId || (earned <= 0 && used <= 0)) return
  if (!(await isMemberPointLineNotifyEnabled())) return
  const result = await deliverMemberPointLineNotify({
    memberId,
    earned,
    used,
    balanceAfter: params.balanceAfter,
    tierCode: params.tierCode,
    storeCode: params.storeCode,
    orderNo: params.orderNo,
  })
  if (!result.ok) {
    console.warn('member-point-line-notify: push_failed', { memberId, message: result.message })
  }
}

export async function sendMemberPointLineTestNotify(memberId: number): Promise<{
  ok: boolean
  message?: string
  channel?: string
}> {
  const readiness = await getMemberPointLineNotifyReadiness(memberId)
  if (!readiness.lineTokenConfigured) return { ok: false, message: 'no_line_token' }
  if (!readiness.lineLinked) return { ok: false, message: 'no_line_identity' }
  const result = await deliverMemberPointLineNotify({
    memberId,
    earned: 1,
    used: 0,
    balanceAfter: readiness.pointBalance,
    tierCode: readiness.tierCode || 'BRONZE',
    storeCode: 'TEST',
    orderNo: 'TEST-NOTIFY',
  })
  return { ok: result.ok, message: result.message, channel: result.channel }
}
