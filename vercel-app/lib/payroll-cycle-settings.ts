import {
  PAYROLL_CYCLE_SETTINGS_KEY,
  parsePayrollCycleSettings,
  normalizePayrollCycleSettings,
  resolvePayrollPeriod,
  type PayrollCycleSettings,
  type ResolvedPayrollPeriod,
} from '@/lib/payroll-cycle'
import {
  loadTenantScopedSystemSettingJson,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'

const GLOBAL_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }

function settingsScope(scope?: TenantSettingsScope | null): TenantSettingsScope {
  if (!scope) return GLOBAL_SCOPE
  return { enforce: !!scope.enforce, tenantId: String(scope.tenantId || '') }
}

export async function loadPayrollCycleSettings(
  scope?: TenantSettingsScope | null
): Promise<PayrollCycleSettings> {
  try {
    const raw = await loadTenantScopedSystemSettingJson(PAYROLL_CYCLE_SETTINGS_KEY, settingsScope(scope))
    return parsePayrollCycleSettings(raw)
  } catch {
    return { versions: [] }
  }
}

export async function savePayrollCycleSettings(
  settings: PayrollCycleSettings,
  scope?: TenantSettingsScope | null
): Promise<void> {
  await upsertTenantScopedSystemSettings(
    [{ baseKey: PAYROLL_CYCLE_SETTINGS_KEY, value_json: normalizePayrollCycleSettings(settings) }],
    settingsScope(scope)
  )
}

export async function resolvePayrollPeriodForMonth(
  monthStr: string,
  scope?: TenantSettingsScope | null
): Promise<ResolvedPayrollPeriod> {
  const settings = await loadPayrollCycleSettings(scope)
  return resolvePayrollPeriod(monthStr, settings)
}

export async function payrollPayYmdForSavedMonth(
  monthStr: string,
  scope?: TenantSettingsScope | null
): Promise<string> {
  return (await resolvePayrollPeriodForMonth(monthStr, scope)).payYmd
}
