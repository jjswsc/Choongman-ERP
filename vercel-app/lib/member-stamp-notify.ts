import { pushLineTextMessage } from '@/lib/line-messaging-server'
import { createMemberEvent } from '@/lib/members-server-core'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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

async function wasStampLineNotifySent(orderId: number): Promise<boolean> {
  try {
    const eventId = `stamp_line_notify:order:${orderId}`
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

async function markStampLineNotifySent(orderId: number, memberId: number): Promise<void> {
  try {
    await createMemberEvent({
      eventId: `stamp_line_notify:order:${orderId}`,
      eventType: 'stamp_line_notify',
      memberId,
      payload: { orderId },
      status: 'processed',
    })
  } catch {
    /* ignore duplicate race */
  }
}

export async function notifyMemberStampLineMessage(params: {
  memberId: number
  lines: string[]
  orderId?: number
}): Promise<{ ok: boolean; reason?: string }> {
  const memberId = Number(params.memberId || 0)
  if (!memberId) return { ok: false, reason: 'missing_member' }
  const orderId = Number(params.orderId || 0)
  if (orderId > 0 && (await wasStampLineNotifySent(orderId))) {
    return { ok: false, reason: 'already_sent' }
  }
  const lineUserId = await resolveMemberLineUserId(memberId)
  if (!lineUserId) {
    console.warn('member-stamp-notify: no_line_identity', { memberId, orderId: orderId || undefined })
    return { ok: false, reason: 'no_line_identity' }
  }
  const text = params.lines.filter(Boolean).join('\n').slice(0, 5000)
  if (!text) return { ok: false, reason: 'empty_text' }
  const result = await pushLineTextMessage({ userId: lineUserId, text })
  if (!result.ok) {
    console.warn('member-stamp-notify:', result.message || 'push_failed', { memberId, orderId: orderId || undefined })
    if (orderId > 0) {
      try {
        await createMemberEvent({
          eventId: `stamp_line_notify_fail:order:${orderId}:${Date.now()}`,
          eventType: 'stamp_line_notify_fail',
          memberId,
          payload: { orderId, reason: result.message || 'push_failed' },
          status: 'failed',
          errorMessage: result.message || 'push_failed',
        })
      } catch {
        /* ignore */
      }
    }
    return { ok: false, reason: result.message || 'push_failed' }
  }
  if (orderId > 0) await markStampLineNotifySent(orderId, memberId)
  return { ok: true }
}
