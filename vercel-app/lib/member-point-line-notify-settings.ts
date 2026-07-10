import { supabaseSelectFilter } from '@/lib/supabase-server'

const KEY_LINE_NOTIFY = 'member_point_line_notify_enabled'

function parseBoolSetting(raw: string | undefined, defaultValue: boolean): boolean {
  const v = String(raw ?? '')
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
  if (!v) return defaultValue
  return v === 'true' || v === '1' || v === 'yes'
}

export async function isMemberPointLineNotifyEnabled(): Promise<boolean> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${KEY_LINE_NOTIFY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = String(rows?.[0]?.value_json ?? '')
      .trim()
      .replace(/^"|"$/g, '')
    return parseBoolSetting(raw, true)
  } catch {
    return true
  }
}
