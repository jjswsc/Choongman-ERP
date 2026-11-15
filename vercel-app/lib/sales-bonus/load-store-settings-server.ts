import { supabaseSelect, supabaseSelectFilter, supabaseUpsertMerge } from '@/lib/supabase-server'
import {
  defaultStoreSalesBonusSettings,
  normalizeSalesBonusTiers,
  parseStoreSalesBonusSettingsRow,
} from '@/lib/sales-bonus/compute-sales-bonus'
import { normalizeSalesBonusPayoutDay } from '@/lib/sales-bonus/period'
import type { SalesBonusTier, StoreSalesBonusSettings } from '@/lib/sales-bonus/types'

export async function loadAllStoreSalesBonusSettings(): Promise<StoreSalesBonusSettings[]> {
  try {
    const rows = (await supabaseSelect('store_sales_bonus_settings', {
      order: 'store_code.asc',
      limit: 500,
    })) as Record<string, unknown>[]
    return (rows || []).map((r) => parseStoreSalesBonusSettingsRow(r))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/relation|does not exist|42P01|store_sales_bonus_settings/i.test(msg)) {
      return []
    }
    throw e
  }
}

export async function loadStoreSalesBonusSettings(
  storeCode: string
): Promise<StoreSalesBonusSettings> {
  const code = String(storeCode || '').trim()
  if (!code) return defaultStoreSalesBonusSettings('')
  try {
    const rows = (await supabaseSelectFilter(
      'store_sales_bonus_settings',
      `store_code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as Record<string, unknown>[]
    if (rows?.[0]) return parseStoreSalesBonusSettingsRow(rows[0], code)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/relation|does not exist|42P01|store_sales_bonus_settings/i.test(msg)) {
      return defaultStoreSalesBonusSettings(code)
    }
    throw e
  }
  return defaultStoreSalesBonusSettings(code)
}

export async function loadStoreSalesBonusSettingsMap(
  storeCodes: string[]
): Promise<Map<string, StoreSalesBonusSettings>> {
  const map = new Map<string, StoreSalesBonusSettings>()
  const codes = Array.from(new Set(storeCodes.map((s) => String(s || '').trim()).filter(Boolean)))
  if (codes.length === 0) return map
  try {
    const filter =
      codes.length === 1
        ? `store_code=eq.${encodeURIComponent(codes[0])}`
        : `store_code=in.(${codes.map((c) => `"${c.replace(/"/g, '')}"`).join(',')})`
    const rows = (await supabaseSelectFilter('store_sales_bonus_settings', filter, {
      limit: 500,
    })) as Record<string, unknown>[]
    for (const r of rows || []) {
      const parsed = parseStoreSalesBonusSettingsRow(r)
      if (parsed.storeCode) map.set(parsed.storeCode, parsed)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/relation|does not exist|42P01|store_sales_bonus_settings/i.test(msg)) throw e
  }
  for (const c of codes) {
    if (!map.has(c)) map.set(c, defaultStoreSalesBonusSettings(c))
  }
  return map
}

export type SaveStoreSalesBonusSettingsInput = {
  storeCode: string
  enabled: boolean
  absencePenaltyPctPerDay: number
  managerMultiplier: number
  staffMultiplier: number
  doubleBonusEmployeeId: number | null
  payoutDay: number
  tiers: SalesBonusTier[]
}

export function validateSalesBonusSettingsInput(
  input: SaveStoreSalesBonusSettingsInput
): { ok: true; value: SaveStoreSalesBonusSettingsInput } | { ok: false; msg: string } {
  const storeCode = String(input.storeCode || '').trim()
  if (!storeCode) return { ok: false, msg: '매장 코드가 필요합니다.' }
  const absencePenaltyPctPerDay = Number(input.absencePenaltyPctPerDay)
  if (!Number.isFinite(absencePenaltyPctPerDay) || absencePenaltyPctPerDay < 0 || absencePenaltyPctPerDay > 100) {
    return { ok: false, msg: '결근 패널티(%)는 0~100 사이여야 합니다.' }
  }
  const managerMultiplier = Number(input.managerMultiplier)
  const staffMultiplier = Number(input.staffMultiplier)
  if (!Number.isFinite(managerMultiplier) || managerMultiplier <= 0 || managerMultiplier > 20) {
    return { ok: false, msg: '지정자 배수는 0 초과 20 이하여야 합니다.' }
  }
  if (!Number.isFinite(staffMultiplier) || staffMultiplier <= 0 || staffMultiplier > 20) {
    return { ok: false, msg: '일반 배수는 0 초과 20 이하여야 합니다.' }
  }
  const payoutDay = normalizeSalesBonusPayoutDay(input.payoutDay, 5)
  let doubleBonusEmployeeId: number | null = null
  if (input.doubleBonusEmployeeId != null && input.doubleBonusEmployeeId !== ('' as unknown)) {
    const id = Math.floor(Number(input.doubleBonusEmployeeId))
    if (Number.isFinite(id) && id > 0) doubleBonusEmployeeId = id
  }
  const tiers = normalizeSalesBonusTiers(input.tiers)
  for (const t of tiers) {
    if (t.threshold < 0 || t.amount < 0) {
      return { ok: false, msg: '구간 임계·금액은 0 이상이어야 합니다.' }
    }
  }
  return {
    ok: true,
    value: {
      storeCode,
      enabled: Boolean(input.enabled),
      absencePenaltyPctPerDay,
      managerMultiplier,
      staffMultiplier,
      doubleBonusEmployeeId,
      payoutDay,
      tiers,
    },
  }
}

export async function saveStoreSalesBonusSettings(
  input: SaveStoreSalesBonusSettingsInput
): Promise<StoreSalesBonusSettings> {
  const checked = validateSalesBonusSettingsInput(input)
  if (!checked.ok) throw new Error(checked.msg)
  const v = checked.value
  const row: Record<string, unknown> = {
    store_code: v.storeCode,
    enabled: v.enabled,
    absence_penalty_pct_per_day: v.absencePenaltyPctPerDay,
    manager_multiplier: v.managerMultiplier,
    staff_multiplier: v.staffMultiplier,
    double_bonus_employee_id: v.doubleBonusEmployeeId,
    payout_day: v.payoutDay,
    tiers: v.tiers,
    updated_at: new Date().toISOString(),
  }
  try {
    await supabaseUpsertMerge('store_sales_bonus_settings', 'store_code', row)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 컬럼 미적용 DB 폴백
    if (/double_bonus_employee_id|payout_day|PGRST204|42703/i.test(msg)) {
      const { double_bonus_employee_id: _d, payout_day: _p, ...legacy } = row
      await supabaseUpsertMerge('store_sales_bonus_settings', 'store_code', legacy)
      return parseStoreSalesBonusSettingsRow(legacy, v.storeCode)
    }
    throw e
  }
  return parseStoreSalesBonusSettingsRow(row, v.storeCode)
}
