import 'server-only'

import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  AUTO_NOTICE_CUSTOM_RULES_KEY,
  AUTO_NOTICE_LAST_RUN_KEY,
  AUTO_NOTICE_STOCK_TAKE_KEY,
  AUTO_NOTICE_WORK_LOG_KEY,
  DEFAULT_AUTO_NOTICE_LAST_RUN,
  DEFAULT_AUTO_NOTICE_STOCK_TAKE,
  DEFAULT_AUTO_NOTICE_WORK_LOG,
  normalizeAutoNoticeCustomRules,
  normalizeAutoNoticeLastRun,
  normalizeAutoNoticeStockTake,
  normalizeAutoNoticeWorkLog,
  type AutoNoticeCustomRule,
  type AutoNoticeLastRun,
  type AutoNoticeSettingsPayload,
  type AutoNoticeStockTakeSettings,
  type AutoNoticeWorkLogSettings,
} from '@/lib/auto-notice-settings'

async function readSettingRaw(key: string): Promise<unknown> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${encodeURIComponent(key)}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[] | null
    return rows?.[0]?.value_json
  } catch {
    return null
  }
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await supabaseUpsert(
    'system_settings',
    [
      {
        key,
        value_json: value,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
}

export async function getAutoNoticeWorkLogSettings(): Promise<AutoNoticeWorkLogSettings> {
  const raw = await readSettingRaw(AUTO_NOTICE_WORK_LOG_KEY)
  return raw == null ? { ...DEFAULT_AUTO_NOTICE_WORK_LOG } : normalizeAutoNoticeWorkLog(raw)
}

export async function getAutoNoticeStockTakeSettings(): Promise<AutoNoticeStockTakeSettings> {
  const raw = await readSettingRaw(AUTO_NOTICE_STOCK_TAKE_KEY)
  return raw == null ? { ...DEFAULT_AUTO_NOTICE_STOCK_TAKE } : normalizeAutoNoticeStockTake(raw)
}

export async function getAutoNoticeCustomRules(): Promise<AutoNoticeCustomRule[]> {
  const raw = await readSettingRaw(AUTO_NOTICE_CUSTOM_RULES_KEY)
  return normalizeAutoNoticeCustomRules(raw)
}

export async function getAutoNoticeLastRun(): Promise<AutoNoticeLastRun> {
  const raw = await readSettingRaw(AUTO_NOTICE_LAST_RUN_KEY)
  return raw == null ? { ...DEFAULT_AUTO_NOTICE_LAST_RUN, custom: {} } : normalizeAutoNoticeLastRun(raw)
}

export async function getAutoNoticeSettings(): Promise<AutoNoticeSettingsPayload> {
  const [workLog, stockTake, customRules, lastRun] = await Promise.all([
    getAutoNoticeWorkLogSettings(),
    getAutoNoticeStockTakeSettings(),
    getAutoNoticeCustomRules(),
    getAutoNoticeLastRun(),
  ])
  return { workLog, stockTake, customRules, lastRun }
}

export async function saveAutoNoticeSettings(params: {
  workLog?: Partial<AutoNoticeWorkLogSettings> | null
  stockTake?: Partial<AutoNoticeStockTakeSettings> | null
  customRules?: AutoNoticeCustomRule[] | null
}): Promise<AutoNoticeSettingsPayload> {
  const current = await getAutoNoticeSettings()
  if (params.workLog != null) {
    const next = normalizeAutoNoticeWorkLog({ ...current.workLog, ...params.workLog })
    await writeSetting(AUTO_NOTICE_WORK_LOG_KEY, next)
    current.workLog = next
  }
  if (params.stockTake != null) {
    const next = normalizeAutoNoticeStockTake({ ...current.stockTake, ...params.stockTake })
    await writeSetting(AUTO_NOTICE_STOCK_TAKE_KEY, next)
    current.stockTake = next
  }
  if (params.customRules != null) {
    const next = normalizeAutoNoticeCustomRules(params.customRules)
    await writeSetting(AUTO_NOTICE_CUSTOM_RULES_KEY, next)
    current.customRules = next
    const ids = new Set(next.map((r) => r.id))
    const pruned: Record<string, string> = {}
    for (const [k, v] of Object.entries(current.lastRun.custom || {})) {
      if (ids.has(k)) pruned[k] = v
    }
    const lr = await saveAutoNoticeLastRun({ custom: pruned }, { replaceCustom: true })
    current.lastRun = lr
  }
  return current
}

export async function saveAutoNoticeLastRun(
  patch: Partial<AutoNoticeLastRun>,
  opts?: { replaceCustom?: boolean }
): Promise<AutoNoticeLastRun> {
  const current = await getAutoNoticeLastRun()
  const custom =
    patch.custom == null
      ? current.custom
      : opts?.replaceCustom
        ? patch.custom
        : { ...current.custom, ...patch.custom }
  const next = normalizeAutoNoticeLastRun({
    work_log: patch.work_log ?? current.work_log,
    stock_take: patch.stock_take ?? current.stock_take,
    custom,
  })
  await writeSetting(AUTO_NOTICE_LAST_RUN_KEY, next)
  return next
}
