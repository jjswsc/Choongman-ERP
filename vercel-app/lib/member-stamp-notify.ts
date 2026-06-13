import { pushLineTextMessage } from '@/lib/line-messaging-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

async function resolveMemberLineUserId(memberId: number): Promise<string> {
  const rows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&member_id=eq.${memberId}`,
    { limit: 1, select: 'provider_user_id' }
  )) as Array<{ provider_user_id?: string | null }>
  return String(rows?.[0]?.provider_user_id || '').trim()
}

export async function notifyMemberStampLineMessage(params: {
  memberId: number
  lines: string[]
}): Promise<void> {
  const memberId = Number(params.memberId || 0)
  if (!memberId) return
  const lineUserId = await resolveMemberLineUserId(memberId)
  if (!lineUserId) return
  const text = params.lines.filter(Boolean).join('\n').slice(0, 5000)
  if (!text) return
  const result = await pushLineTextMessage({ userId: lineUserId, text })
  if (!result.ok) {
    console.warn('member-stamp-notify:', result.message || 'push_failed', { memberId })
  }
}
