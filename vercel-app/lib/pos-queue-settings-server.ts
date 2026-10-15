import 'server-only'

import {
  POS_QUEUE_SETTING_KEYS,
  posQueueConfigFromMap,
  posQueueSettingValueText,
  type PosQueueConfig,
} from '@/lib/pos-queue-settings'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const KEYS = Object.values(POS_QUEUE_SETTING_KEYS)

/** loadTenantScopedSystemSettingsMap 은 jsonb 배열을 '' 로 버리므로 value_json 원본을 직접 읽는다 */
export async function loadPosQueueConfig(): Promise<PosQueueConfig> {
  try {
    const filter = `or=(${KEYS.map((k) => `key.eq.${encodeURIComponent(k)}`).join(',')})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: KEYS.length,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]
    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      const text = posQueueSettingValueText(row.value_json)
      if (key && text) map.set(key, text)
    }
    return posQueueConfigFromMap(map)
  } catch {
    return posQueueConfigFromMap(new Map())
  }
}
