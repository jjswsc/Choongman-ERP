/** 자리 대기 번호표 매장 설정 — system_settings 값 해석 (순수) */

export const POS_QUEUE_SETTING_KEYS = {
  storeCodes: 'pos_queue_store_codes',
  allStores: 'pos_queue_all_stores',
  lineNotify: 'pos_queue_line_notify_enabled',
} as const

export interface PosQueueConfig {
  allStores: boolean
  storeCodes: Set<string>
  lineNotifyEnabled: boolean
}

export function normPosQueueStoreCode(code: string): string {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseStoreCodes(raw: string): string[] {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean)
    if (typeof parsed === 'string') return parsed.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)
    return []
  } catch {
    return trimmed
      .split(/[,;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
}

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  const v = String(raw ?? '')
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
  if (!v) return defaultValue
  return v === '1' || v === 'true' || v === 'yes'
}

/** system_settings.value_json 원본 → 문자열 (jsonb 배열 `["CM Union Mall"]` 도 유지) */
export function posQueueSettingValueText(raw: unknown): string {
  if (raw == null) return ''
  if (Array.isArray(raw)) return JSON.stringify(raw)
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw.trim()
  return ''
}

export function posQueueConfigFromMap(map: Map<string, string>): PosQueueConfig {
  return {
    allStores: parseBool(map.get(POS_QUEUE_SETTING_KEYS.allStores), false),
    storeCodes: new Set(parseStoreCodes(map.get(POS_QUEUE_SETTING_KEYS.storeCodes) || '').map(normPosQueueStoreCode)),
    lineNotifyEnabled: parseBool(map.get(POS_QUEUE_SETTING_KEYS.lineNotify), true),
  }
}

export function isPosQueueEnabledForStore(config: PosQueueConfig, storeCode: string): boolean {
  const norm = normPosQueueStoreCode(storeCode)
  if (!norm) return false
  return config.allStores || config.storeCodes.has(norm)
}
