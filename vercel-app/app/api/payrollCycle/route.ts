import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  defaultPayrollMonthForCycle,
  findConfirmedMonthBlockedByCycleChange,
  parsePayrollCycleSettings,
  resolvePayrollPeriod,
  upsertPayrollCycleVersion,
  validatePayrollCycleVersionInput,
  type PayrollCycleSettings,
} from '@/lib/payroll-cycle'
import { shiftYearMonth } from '@/lib/payroll-utils'
import { loadPayrollCycleSettings, savePayrollCycleSettings } from '@/lib/payroll-cycle-settings'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

function canEditPayrollRules(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

async function loadConfirmedPayrollMonths(
  tenantScope: Awaited<ReturnType<typeof resolveSaasTenantScope>>
): Promise<string[]> {
  if (isSaasTenantQueryBlocked(tenantScope, 'payroll_records')) return []
  const baseFilter = 'status=eq.' + encodeURIComponent('확정')
  const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'payroll_records') || baseFilter
  try {
    const rows = (await supabaseSelectFilter('payroll_records', filter, {
      select: 'month',
      limit: 5000,
    })) as { month?: string }[] | null
    const months = new Set<string>()
    for (const r of rows || []) {
      const m = String(r.month || '').slice(0, 7)
      if (m) months.add(m)
    }
    return [...months]
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('payroll_records')
      const rows = (await supabaseSelectFilter('payroll_records', baseFilter, {
        select: 'month',
        limit: 5000,
      })) as { month?: string }[] | null
      const months = new Set<string>()
      for (const r of rows || []) {
        const m = String(r.month || '').slice(0, 7)
        if (m) months.add(m)
      }
      return [...months]
    }
    throw e
  }
}

async function previousMonthHasConfirmed(
  monthStr: string,
  tenantScope: Awaited<ReturnType<typeof resolveSaasTenantScope>>
): Promise<boolean> {
  const prev = shiftYearMonth(monthStr, -1)
  if (!prev) return true
  if (isSaasTenantQueryBlocked(tenantScope, 'payroll_records')) return true
  const baseFilter = `month=eq.${encodeURIComponent(prev)}&status=eq.${encodeURIComponent('확정')}`
  const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'payroll_records') || baseFilter
  try {
    const rows = (await supabaseSelectFilter('payroll_records', filter, {
      select: 'month',
      limit: 1,
    })) as { month?: string }[] | null
    return (rows || []).length > 0
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('payroll_records')
      const rows = (await supabaseSelectFilter('payroll_records', baseFilter, {
        select: 'month',
        limit: 1,
      })) as { month?: string }[] | null
      return (rows || []).length > 0
    }
    return true
  }
}

function previewMonths(settings: PayrollCycleSettings, aroundMonth: string) {
  const months = [shiftYearMonth(aroundMonth, -1), aroundMonth, shiftYearMonth(aroundMonth, 1)].filter(Boolean)
  return months.map((month) => resolvePayrollPeriod(month, settings))
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse

  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  const { searchParams } = new URL(req.url)
  const previewMonth = String(searchParams.get('month') || '').slice(0, 7)

  try {
    const settings = await loadPayrollCycleSettings(tenantScope)
    const defaultMonth = defaultPayrollMonthForCycle(settings)
    const month = /^\d{4}-\d{2}$/.test(previewMonth) ? previewMonth : defaultMonth
    return NextResponse.json(
      {
        settings,
        canEdit: canEditPayrollRules(authResult.auth.role || ''),
        defaultMonth,
        period: resolvePayrollPeriod(month, settings),
        preview: previewMonths(settings, month),
      },
      { headers }
    )
  } catch (e) {
    console.error('payrollCycle GET:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canEditPayrollRules(authResult.auth.role || '')) {
    return NextResponse.json({ success: false, message: '본사 또는 회계 권한이 필요합니다.' }, { status: 403, headers })
  }

  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })

  try {
    const body = (await req.json()) as Record<string, unknown>
    const parsed = validatePayrollCycleVersionInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, message: parsed.message }, { status: 400, headers })
    }

    const current = await loadPayrollCycleSettings(tenantScope)
    const proposed = upsertPayrollCycleVersion(current, parsed.version)
    const confirmedMonths = await loadConfirmedPayrollMonths(tenantScope)
    const blocked = findConfirmedMonthBlockedByCycleChange(confirmedMonths, current, proposed)
    if (blocked) {
      return NextResponse.json(
        {
          success: false,
          message: `${blocked} 급여가 이미 확정되어 근무기간·지급일을 바꿀 수 없습니다. 이후 월부터 새 적용월을 추가하세요.`,
        },
        { status: 409, headers }
      )
    }

    await savePayrollCycleSettings(proposed, tenantScope)
    const defaultMonth = defaultPayrollMonthForCycle(proposed)
    const prevConfirmed = await previousMonthHasConfirmed(parsed.version.effectiveMonth, tenantScope)
    const warning = prevConfirmed
      ? ''
      : `${parsed.version.effectiveMonth} 직전 달이 아직 확정되지 않았습니다. 전환 전에 직전 달을 확정하는 것이 안전합니다.`

    return NextResponse.json(
      {
        success: true,
        settings: proposed,
        defaultMonth,
        period: resolvePayrollPeriod(parsed.version.effectiveMonth, proposed),
        preview: previewMonths(proposed, parsed.version.effectiveMonth),
        warning,
      },
      { headers }
    )
  } catch (e) {
    console.error('payrollCycle POST:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
