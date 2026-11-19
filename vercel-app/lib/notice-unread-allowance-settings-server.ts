import 'server-only'

import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS,
  NOTICE_UNREAD_ALLOWANCE_SETTINGS_KEY,
  normalizeNoticeUnreadAllowanceSettings,
  type NoticeUnreadAllowanceSettings,
} from '@/lib/notice-unread-allowance-settings'

export async function getNoticeUnreadAllowanceSettings(): Promise<NoticeUnreadAllowanceSettings> {
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(NOTICE_UNREAD_ALLOWANCE_SETTINGS_KEY)}`,
      { limit: 1, select: 'value_json' }
    )) as { value_json?: unknown }[] | null
    const raw = rows?.[0]?.value_json
    if (raw == null) return { ...DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS }
    return normalizeNoticeUnreadAllowanceSettings(raw)
  } catch {
    return { ...DEFAULT_NOTICE_UNREAD_ALLOWANCE_SETTINGS }
  }
}

export async function saveNoticeUnreadAllowanceSettings(
  patch: Partial<NoticeUnreadAllowanceSettings>
): Promise<NoticeUnreadAllowanceSettings> {
  const current = await getNoticeUnreadAllowanceSettings()
  const next = normalizeNoticeUnreadAllowanceSettings({ ...current, ...patch })
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: NOTICE_UNREAD_ALLOWANCE_SETTINGS_KEY,
        value_json: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  return next
}
