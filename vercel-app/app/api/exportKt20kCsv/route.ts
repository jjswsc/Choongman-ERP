import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

type PayrollLikeRow = {
  month?: string
  store?: string
  name?: string
  employee_id?: number | null
  salary?: number | null
  pos_allow?: number | null
  haz_allow?: number | null
  diligence_allow?: number | null
  birth_bonus?: number | null
  spl_bonus?: number | null
  ot_amt?: number | null
  holiday_pay?: number | null
  status?: string | null
}

type Kt20kMonthSummary = {
  month: string
  employeeCount: number
  salaryAmount: number
  dailyWageAmount: number
  otherCompAmount: number
  totalWage: number
  excessOver20000: number
  netWageToReport: number
}

type Kt20kMonthlyRpcRow = {
  month?: string | null
  employee_count?: number | null
  salary_amount?: number | null
  daily_wage_amount?: number | null
  other_comp_amount?: number | null
  total_wage?: number | null
  excess_over_20000?: number | null
  net_wage_to_report?: number | null
}

const KT20K_EXPORT_SCAN_MAX_ROWS = 1_000_000

function isMissingKt20kRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_kt20k_monthly_agg') || msg.includes('42883')
}

function toFinite(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function isPaidStatus(v: unknown): boolean {
  const s = String(v || '').trim().toLowerCase()
  if (!s) return false
  return s === 'paid' || s === 'done' || s === 'completed' || s.includes('paid') || s.includes('ชำระ')
}

function makeInitialMonthRows(year: number): Kt20kMonthSummary[] {
  const out: Kt20kMonthSummary[] = []
  for (let m = 1; m <= 12; m++) {
    out.push({
      month: `${year}-${String(m).padStart(2, '0')}`,
      employeeCount: 0,
      salaryAmount: 0,
      dailyWageAmount: 0,
      otherCompAmount: 0,
      totalWage: 0,
      excessOver20000: 0,
      netWageToReport: 0,
    })
  }
  return out
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const yearRaw = String(searchParams.get('year') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const year = Number(yearRaw)
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'INVALID_YEAR' }, { status: 400, headers })
  }

  try {
    try {
      const monthlyRows = await supabaseRpc<Kt20kMonthlyRpcRow[]>('get_kt20k_monthly_agg', {
        p_year: year,
        p_store: storeFilter || 'All',
      })
      const monthRows: Kt20kMonthSummary[] = (monthlyRows || []).map((r) => ({
        month: String(r.month || ''),
        employeeCount: Number(r.employee_count || 0),
        salaryAmount: round2(Number(r.salary_amount || 0)),
        dailyWageAmount: round2(Number(r.daily_wage_amount || 0)),
        otherCompAmount: round2(Number(r.other_comp_amount || 0)),
        totalWage: round2(Number(r.total_wage || 0)),
        excessOver20000: round2(Number(r.excess_over_20000 || 0)),
        netWageToReport: round2(Number(r.net_wage_to_report || 0)),
      }))
      const annual = monthRows.reduce(
        (acc, cur) => {
          acc.employeeCountPeak = Math.max(acc.employeeCountPeak, cur.employeeCount)
          acc.salaryAmount += cur.salaryAmount
          acc.dailyWageAmount += cur.dailyWageAmount
          acc.otherCompAmount += cur.otherCompAmount
          acc.totalWage += cur.totalWage
          acc.excessOver20000 += cur.excessOver20000
          acc.netWageToReport += cur.netWageToReport
          return acc
        },
        {
          employeeCountPeak: 0,
          salaryAmount: 0,
          dailyWageAmount: 0,
          otherCompAmount: 0,
          totalWage: 0,
          excessOver20000: 0,
          netWageToReport: 0,
        }
      )
      const lines: string[] = []
      lines.push(
        [
          'month',
          'employee_count',
          'salary_amount',
          'daily_wage_amount',
          'other_comp_amount',
          'total_wage_(1)',
          'excess_over_20000_(2)',
          'net_wage_to_report_(3)',
        ].join(',')
      )
      for (const r of monthRows) {
        lines.push(
          [
            csvCell(r.month),
            r.employeeCount,
            r.salaryAmount,
            r.dailyWageAmount,
            r.otherCompAmount,
            r.totalWage,
            r.excessOver20000,
            r.netWageToReport,
          ].join(',')
        )
      }
      lines.push(
        [
          'ANNUAL',
          annual.employeeCountPeak,
          round2(annual.salaryAmount),
          round2(annual.dailyWageAmount),
          round2(annual.otherCompAmount),
          round2(annual.totalWage),
          round2(annual.excessOver20000),
          round2(annual.netWageToReport),
        ].join(',')
      )
      const csv = `\uFEFF${lines.join('\r\n')}`
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="kt20k-${year}.csv"`,
        },
      })
    } catch (rpcErr) {
      if (!isMissingKt20kRpcError(rpcErr)) throw rpcErr
      console.warn('exportKt20kCsv rpc fallback: missing function')
    }

    const start = `${year}-01`
    const end = `${year}-12`
    const filters = [`month=gte.${encodeURIComponent(start)}`, `month=lte.${encodeURIComponent(end)}`]
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      filters.push(`store=eq.${encodeURIComponent(storeFilter)}`)
    }
    const filter = filters.join('&')
    const rows = (await supabaseSelectFilterAllPages('payroll_records', filter, {
      select:
        'month,store,name,employee_id,salary,pos_allow,haz_allow,diligence_allow,birth_bonus,spl_bonus,ot_amt,holiday_pay,status',
      pageSize: 8000,
      maxRows: KT20K_EXPORT_SCAN_MAX_ROWS,
      order: 'month.asc,store.asc,name.asc',
    })) as PayrollLikeRow[] | null

    const monthMap = new Map<string, Kt20kMonthSummary>(
      makeInitialMonthRows(year).map((r) => [r.month, r])
    )
    const monthEmpSet = new Map<string, Set<string>>()
    const monthEmpTotalMap = new Map<string, Map<string, number>>()
    for (const row of rows || []) {
      if (!isPaidStatus(row.status)) continue
      const month = String(row.month || '').slice(0, 7)
      if (!monthMap.has(month)) continue
      const summary = monthMap.get(month)!
      const employeeId =
        row.employee_id != null && Number.isFinite(Number(row.employee_id)) ? Math.floor(Number(row.employee_id)) : 0
      const empKey = employeeId > 0 ? `#${employeeId}` : `${String(row.store || '')}|${String(row.name || '')}`
      if (!monthEmpSet.has(month)) monthEmpSet.set(month, new Set())
      monthEmpSet.get(month)!.add(empKey)
      const salary = toFinite(row.salary)
      const otherComp =
        toFinite(row.pos_allow) +
        toFinite(row.haz_allow) +
        toFinite(row.diligence_allow) +
        toFinite(row.birth_bonus) +
        toFinite(row.spl_bonus) +
        toFinite(row.ot_amt) +
        toFinite(row.holiday_pay)
      const daily = 0
      const total = salary + otherComp + daily
      summary.salaryAmount += salary
      summary.otherCompAmount += otherComp
      summary.dailyWageAmount += daily
      summary.totalWage += total
      if (!monthEmpTotalMap.has(month)) monthEmpTotalMap.set(month, new Map())
      const empTotals = monthEmpTotalMap.get(month)!
      empTotals.set(empKey, (empTotals.get(empKey) || 0) + total)
    }

    const monthRows = Array.from(monthMap.values()).map((summary) => {
      const empSet = monthEmpSet.get(summary.month) || new Set()
      const empTotals = monthEmpTotalMap.get(summary.month) || new Map<string, number>()
      let excess = 0
      for (const [, total] of empTotals) if (total > 20000) excess += total - 20000
      summary.employeeCount = empSet.size
      summary.excessOver20000 = round2(excess)
      summary.netWageToReport = round2(summary.totalWage - summary.excessOver20000)
      summary.salaryAmount = round2(summary.salaryAmount)
      summary.dailyWageAmount = round2(summary.dailyWageAmount)
      summary.otherCompAmount = round2(summary.otherCompAmount)
      summary.totalWage = round2(summary.totalWage)
      return summary
    })

    const annual = monthRows.reduce(
      (acc, cur) => {
        acc.employeeCountPeak = Math.max(acc.employeeCountPeak, cur.employeeCount)
        acc.salaryAmount += cur.salaryAmount
        acc.dailyWageAmount += cur.dailyWageAmount
        acc.otherCompAmount += cur.otherCompAmount
        acc.totalWage += cur.totalWage
        acc.excessOver20000 += cur.excessOver20000
        acc.netWageToReport += cur.netWageToReport
        return acc
      },
      {
        employeeCountPeak: 0,
        salaryAmount: 0,
        dailyWageAmount: 0,
        otherCompAmount: 0,
        totalWage: 0,
        excessOver20000: 0,
        netWageToReport: 0,
      }
    )

    const lines: string[] = []
    lines.push(
      [
        'month',
        'employee_count',
        'salary_amount',
        'daily_wage_amount',
        'other_comp_amount',
        'total_wage_(1)',
        'excess_over_20000_(2)',
        'net_wage_to_report_(3)',
      ].join(',')
    )
    for (const r of monthRows) {
      lines.push(
        [
          csvCell(r.month),
          r.employeeCount,
          r.salaryAmount,
          r.dailyWageAmount,
          r.otherCompAmount,
          r.totalWage,
          r.excessOver20000,
          r.netWageToReport,
        ].join(',')
      )
    }
    lines.push(
      [
        'ANNUAL',
        annual.employeeCountPeak,
        round2(annual.salaryAmount),
        round2(annual.dailyWageAmount),
        round2(annual.otherCompAmount),
        round2(annual.totalWage),
        round2(annual.excessOver20000),
        round2(annual.netWageToReport),
      ].join(',')
    )
    const csv = `\uFEFF${lines.join('\r\n')}`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kt20k-${year}.csv"`,
      },
    })
  } catch (e) {
    console.error('exportKt20kCsv:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

