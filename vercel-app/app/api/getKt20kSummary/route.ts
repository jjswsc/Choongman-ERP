import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
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

type WhtLedgerLikeRow = {
  tax_month?: string | null
  store_name?: string | null
  payee_name?: string | null
  form_hint?: string | null
  gross_amount?: number | null
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

type Kt20kPnd1aMonthlyDiff = {
  month: string
  kt20kTotalWage: number
  kt20kNetWage: number
  pnd1aLedgerGross: number
  diffTotalVsPnd1a: number
  diffNetVsPnd1a: number
}

type Kt20kPnd1aEmployeeDiff = {
  employeeKey: string
  name: string
  store: string
  kt20kTotalWage: number
  pnd1aLedgerGross: number
  diff: number
  reasonTags: string[]
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
  pnd1a_ledger_gross?: number | null
  diff_total_vs_pnd1a?: number | null
  diff_net_vs_pnd1a?: number | null
}

type Kt20kEmployeeDiffRpcRow = {
  employee_key?: string | null
  name?: string | null
  store?: string | null
  kt20k_total_wage?: number | null
  pnd1a_ledger_gross?: number | null
  diff?: number | null
  reason_tags?: unknown
}

function isMissingKt20kRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('get_kt20k_monthly_agg') ||
    msg.includes('get_kt20k_employee_diff_top') ||
    msg.includes('42883')
  )
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
  return (
    s === 'paid' ||
    s === 'done' ||
    s === 'completed' ||
    s.includes('paid') ||
    s.includes('ชำระ')
  )
}

function normalizeFormHint(v: unknown): 'pnd1' | 'pnd1a' | 'other' {
  const raw = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!raw) return 'other'
  if (raw.includes('1ก') || raw.includes('pnd1a') || raw.includes('ภ.ง.ด.1ก')) return 'pnd1a'
  if (raw.includes('pnd1') || raw.includes('ภ.ง.ด.1') || raw === '1') return 'pnd1'
  return 'other'
}

function makeInitialMonthRows(year: number): Kt20kMonthSummary[] {
  const out: Kt20kMonthSummary[] = []
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`
    out.push({
      month,
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
      const [monthlyRows, topDiffRows] = await Promise.all([
        supabaseRpc<Kt20kMonthlyRpcRow[]>('get_kt20k_monthly_agg', {
          p_year: year,
          p_store: storeFilter || 'All',
        }),
        supabaseRpc<Kt20kEmployeeDiffRpcRow[]>('get_kt20k_employee_diff_top', {
          p_year: year,
          p_store: storeFilter || 'All',
          p_limit: 50,
        }),
      ])

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

      const reconcileMonthly: Kt20kPnd1aMonthlyDiff[] = (monthlyRows || []).map((r) => ({
        month: String(r.month || ''),
        kt20kTotalWage: round2(Number(r.total_wage || 0)),
        kt20kNetWage: round2(Number(r.net_wage_to_report || 0)),
        pnd1aLedgerGross: round2(Number(r.pnd1a_ledger_gross || 0)),
        diffTotalVsPnd1a: round2(Number(r.diff_total_vs_pnd1a || 0)),
        diffNetVsPnd1a: round2(Number(r.diff_net_vs_pnd1a || 0)),
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

      const reconcileEmployeeTop: Kt20kPnd1aEmployeeDiff[] = (topDiffRows || []).map((r) => ({
        employeeKey: String(r.employee_key || ''),
        name: String(r.name || ''),
        store: String(r.store || ''),
        kt20kTotalWage: round2(Number(r.kt20k_total_wage || 0)),
        pnd1aLedgerGross: round2(Number(r.pnd1a_ledger_gross || 0)),
        diff: round2(Number(r.diff || 0)),
        reasonTags: Array.isArray(r.reason_tags) ? r.reason_tags.map((x) => String(x || '')) : [],
      }))

      const pnd1aAnnualGross = reconcileMonthly.reduce((s, r) => s + r.pnd1aLedgerGross, 0)
      return NextResponse.json(
        {
          year,
          storeFilter: storeFilter || 'All',
          rows: monthRows,
          annual: {
            employeeCountPeak: annual.employeeCountPeak,
            salaryAmount: round2(annual.salaryAmount),
            dailyWageAmount: round2(annual.dailyWageAmount),
            otherCompAmount: round2(annual.otherCompAmount),
            totalWage: round2(annual.totalWage),
            excessOver20000: round2(annual.excessOver20000),
            netWageToReport: round2(annual.netWageToReport),
          },
          reconciliation: {
            monthly: reconcileMonthly,
            employeeTopDiff: reconcileEmployeeTop,
            annual: {
              kt20kTotalWage: round2(annual.totalWage),
              kt20kNetWage: round2(annual.netWageToReport),
              pnd1aLedgerGross: round2(pnd1aAnnualGross),
              diffTotalVsPnd1a: round2(annual.totalWage - pnd1aAnnualGross),
              diffNetVsPnd1a: round2(annual.netWageToReport - pnd1aAnnualGross),
            },
          },
          warnings: [
            'daily_wage_amount는 현재 스키마상 분리값이 없어 0으로 계산됩니다.',
            'other_comp_amount는 pos_allow/haz_allow/diligence_allow/birth_bonus/spl_bonus/ot_amt/holiday_pay 합계입니다.',
            'PND1A 대사는 withholding_tax_ledger_entries(form_hint=PND1A/ภ.ง.ด.1ก)의 gross_amount 기준입니다.',
          ],
          fallbackUsed: false,
        },
        { headers }
      )
    } catch (rpcErr) {
      if (!isMissingKt20kRpcError(rpcErr)) throw rpcErr
      console.warn('getKt20kSummary rpc fallback: missing function')
    }

    const start = `${year}-01`
    const end = `${year}-12`
    const filters = [`month=gte.${encodeURIComponent(start)}`, `month=lte.${encodeURIComponent(end)}`]
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
      filters.push(`store=eq.${encodeURIComponent(storeFilter)}`)
    }
    const filter = filters.join('&')
    const [rows, whtRows] = await Promise.all([
      supabaseSelectFilter('payroll_records', filter, {
        select:
          'month,store,name,employee_id,salary,pos_allow,haz_allow,diligence_allow,birth_bonus,spl_bonus,ot_amt,holiday_pay,status',
        limit: 50000,
        order: 'month.asc,store.asc,name.asc',
      }) as Promise<PayrollLikeRow[] | null>,
      (() => {
        const whtFilters = [`tax_month=gte.${encodeURIComponent(start)}`, `tax_month=lte.${encodeURIComponent(end)}`]
        if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체') {
          whtFilters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
        }
        return supabaseSelectFilter('withholding_tax_ledger_entries', whtFilters.join('&'), {
          select: 'tax_month,store_name,payee_name,form_hint,gross_amount',
          limit: 50000,
          order: 'tax_month.asc,payee_name.asc',
        }) as Promise<WhtLedgerLikeRow[] | null>
      })(),
    ])
    const payrollRows = rows as PayrollLikeRow[] | null
    const pnd1aLedgerRows = (whtRows || []).filter((r) => normalizeFormHint(r.form_hint) === 'pnd1a')

    const monthMap = new Map<string, Kt20kMonthSummary>(
      makeInitialMonthRows(year).map((r) => [r.month, r])
    )
    const monthEmpSet = new Map<string, Set<string>>()
    const monthEmpTotalMap = new Map<string, Map<string, number>>()
    const kt20kEmpDetail = new Map<string, { name: string; store: string; total: number }>()

    for (const row of payrollRows || []) {
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
      // 현재 스키마에는 KT20K 전용 일당 분리 컬럼이 없어 MVP에서는 0 고정
      const daily = 0
      const total = salary + otherComp + daily

      summary.salaryAmount += salary
      summary.otherCompAmount += otherComp
      summary.dailyWageAmount += daily
      summary.totalWage += total

      if (!monthEmpTotalMap.has(month)) monthEmpTotalMap.set(month, new Map())
      const empTotals = monthEmpTotalMap.get(month)!
      empTotals.set(empKey, (empTotals.get(empKey) || 0) + total)

      const annualEmpKey = `${String(row.store || '').trim()}|${String(row.name || '').trim()}`
      const prevEmp = kt20kEmpDetail.get(annualEmpKey) || {
        name: String(row.name || '').trim(),
        store: String(row.store || '').trim(),
        total: 0,
      }
      prevEmp.total += total
      kt20kEmpDetail.set(annualEmpKey, prevEmp)
    }

    const monthRows = Array.from(monthMap.values()).map((summary) => {
      const empSet = monthEmpSet.get(summary.month) || new Set()
      const empTotals = monthEmpTotalMap.get(summary.month) || new Map<string, number>()
      let excess = 0
      for (const [, total] of empTotals) {
        if (total > 20000) excess += total - 20000
      }
      summary.employeeCount = empSet.size
      summary.excessOver20000 = excess
      summary.netWageToReport = summary.totalWage - summary.excessOver20000
      summary.salaryAmount = round2(summary.salaryAmount)
      summary.dailyWageAmount = round2(summary.dailyWageAmount)
      summary.otherCompAmount = round2(summary.otherCompAmount)
      summary.totalWage = round2(summary.totalWage)
      summary.excessOver20000 = round2(summary.excessOver20000)
      summary.netWageToReport = round2(summary.netWageToReport)
      return summary
    })

    const pnd1aMonthGrossMap = new Map<string, number>()
    const pnd1aEmpDetail = new Map<string, { name: string; store: string; total: number }>()
    for (const row of pnd1aLedgerRows) {
      const month = String(row.tax_month || '').slice(0, 7)
      if (!monthMap.has(month)) continue
      const gross = toFinite(row.gross_amount)
      pnd1aMonthGrossMap.set(month, (pnd1aMonthGrossMap.get(month) || 0) + gross)
      const store = String(row.store_name || '').trim()
      const name = String(row.payee_name || '').trim()
      if (!name) continue
      const key = `${store}|${name}`
      const prev = pnd1aEmpDetail.get(key) || { name, store, total: 0 }
      prev.total += gross
      pnd1aEmpDetail.set(key, prev)
    }

    const kt20kNameSet = new Set<string>(Array.from(kt20kEmpDetail.values()).map((v) => v.name).filter(Boolean))
    const pnd1aNameSet = new Set<string>(Array.from(pnd1aEmpDetail.values()).map((v) => v.name).filter(Boolean))
    const kt20kStoreSet = new Set<string>(Array.from(kt20kEmpDetail.values()).map((v) => v.store).filter(Boolean))
    const pnd1aStoreSet = new Set<string>(Array.from(pnd1aEmpDetail.values()).map((v) => v.store).filter(Boolean))

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

    const reconcileMonthly: Kt20kPnd1aMonthlyDiff[] = monthRows.map((r) => {
      const ledgerGross = round2(pnd1aMonthGrossMap.get(r.month) || 0)
      return {
        month: r.month,
        kt20kTotalWage: r.totalWage,
        kt20kNetWage: r.netWageToReport,
        pnd1aLedgerGross: ledgerGross,
        diffTotalVsPnd1a: round2(r.totalWage - ledgerGross),
        diffNetVsPnd1a: round2(r.netWageToReport - ledgerGross),
      }
    })

    const employeeKeySet = new Set<string>([
      ...Array.from(kt20kEmpDetail.keys()),
      ...Array.from(pnd1aEmpDetail.keys()),
    ])
    const reconcileEmployeeTop: Kt20kPnd1aEmployeeDiff[] = Array.from(employeeKeySet)
      .map((k) => {
        const a = kt20kEmpDetail.get(k)
        const b = pnd1aEmpDetail.get(k)
        const name = a?.name || b?.name || ''
        const store = a?.store || b?.store || ''
        const kt20k = round2(a?.total || 0)
        const pnd1a = round2(b?.total || 0)
        const reasonTags: string[] = []
        if (a && !b) reasonTags.push('missing_in_pnd1a')
        if (!a && b) reasonTags.push('missing_in_kt20k')
        if (a && b && Math.abs(kt20k - pnd1a) > 0.0001) reasonTags.push('amount_mismatch')
        if (a && !b) {
          if (pnd1aNameSet.has(name)) reasonTags.push('possible_store_mismatch')
          if (pnd1aStoreSet.has(store)) reasonTags.push('possible_name_mismatch')
        }
        if (!a && b) {
          if (kt20kNameSet.has(name)) reasonTags.push('possible_store_mismatch')
          if (kt20kStoreSet.has(store)) reasonTags.push('possible_name_mismatch')
        }
        return {
          employeeKey: k,
          name,
          store,
          kt20kTotalWage: kt20k,
          pnd1aLedgerGross: pnd1a,
          diff: round2(kt20k - pnd1a),
          reasonTags,
        }
      })
      .filter((x) => Math.abs(x.diff) > 0.0001)
      .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
      .slice(0, 50)

    return NextResponse.json(
      {
        year,
        storeFilter: storeFilter || 'All',
        rows: monthRows,
        annual: {
          employeeCountPeak: annual.employeeCountPeak,
          salaryAmount: round2(annual.salaryAmount),
          dailyWageAmount: round2(annual.dailyWageAmount),
          otherCompAmount: round2(annual.otherCompAmount),
          totalWage: round2(annual.totalWage),
          excessOver20000: round2(annual.excessOver20000),
          netWageToReport: round2(annual.netWageToReport),
        },
        reconciliation: {
          monthly: reconcileMonthly,
          employeeTopDiff: reconcileEmployeeTop,
          annual: {
            kt20kTotalWage: round2(annual.totalWage),
            kt20kNetWage: round2(annual.netWageToReport),
            pnd1aLedgerGross: round2(reconcileMonthly.reduce((s, r) => s + r.pnd1aLedgerGross, 0)),
            diffTotalVsPnd1a: round2(
              annual.totalWage - reconcileMonthly.reduce((s, r) => s + r.pnd1aLedgerGross, 0)
            ),
            diffNetVsPnd1a: round2(
              annual.netWageToReport - reconcileMonthly.reduce((s, r) => s + r.pnd1aLedgerGross, 0)
            ),
          },
        },
        warnings: [
          'daily_wage_amount는 현재 스키마상 분리값이 없어 0으로 계산됩니다.',
          'other_comp_amount는 pos_allow/haz_allow/diligence_allow/birth_bonus/spl_bonus/ot_amt/holiday_pay 합계입니다.',
          'PND1A 대사는 withholding_tax_ledger_entries(form_hint=PND1A/ภ.ง.ด.1ก)의 gross_amount 기준입니다.',
        ],
        fallbackUsed: true,
      },
      { headers }
    )
  } catch (e) {
    console.error('getKt20kSummary:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

