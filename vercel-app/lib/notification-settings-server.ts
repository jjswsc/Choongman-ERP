/**
 * 알림 설정 조회 (서버 전용 - API routes, sendNotice 등)
 */
import { supabaseSelectFilter } from './supabase-server'

export async function getNotificationSettings(): Promise<{
  pushNoticeEnabled: boolean
  pushOrderApprovalEnabled: boolean
}> {
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      'or=(key.eq.push_notice_enabled,key.eq.push_order_approval_enabled)',
      { limit: 10 }
    )) as { key?: string; value_json?: number | boolean }[] | null

    const map: Record<string, boolean> = {
      push_notice_enabled: true,
      push_order_approval_enabled: true,
    }
    for (const r of rows || []) {
      const k = r.key ?? ''
      const v = r.value_json
      map[k] = v === 1 || v === true
    }
    return {
      pushNoticeEnabled: map.push_notice_enabled !== false,
      pushOrderApprovalEnabled: map.push_order_approval_enabled !== false,
    }
  } catch {
    return { pushNoticeEnabled: true, pushOrderApprovalEnabled: true }
  }
}
