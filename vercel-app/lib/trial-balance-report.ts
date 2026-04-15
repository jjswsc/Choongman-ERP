import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeIncomeScope, storeMatchesIncomeFilter, type IncomeScopeInput } from '@/lib/accounting-reports'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'

export type TrialBalanceRow = {
  accountCode: string
  accountName: string | null
  debit: number
  credit: number
  netDebit: number
}

export type TrialBalanceReport = {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  diff: number
}

function storeMatch(entryStore: string | null | undefined, filter: string): boolean {
  return storeMatchesIncomeFilter(String(entryStore || ''), filter)
}

/**
 * 해당 월의 journal_lines 합계로 시산표 (분개 원장 기준).
 */
export async function computeTrialBalanceReport(input: IncomeScopeInput): Promise<TrialBalanceReport> {
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter } = scope

  const jeFilter = `accounting_date=gte.${encodeURIComponent(startStr)}&accounting_date=lte.${encodeURIComponent(endStr)}`
  const entries = (await supabaseSelectFilter('journal_entries', jeFilter, {
    select: 'id,store_name',
    limit: 50000,
    order: 'accounting_date.asc',
  })) as { id?: number; store_name?: string | null }[] | null

  const ids = (entries || [])
    .filter((e) => storeMatch(e.store_name, storeFilter))
    .map((e) => Number(e.id))
    .filter((id) => id > 0)

  if (ids.length === 0) {
    return {
      yearMonth,
      startStr,
      endStr,
      storeFilter,
      timezone: 'Asia/Bangkok',
      rows: [],
      totalDebit: 0,
      totalCredit: 0,
      diff: 0,
    }
  }

  const idList = ids.join(',')
  const lines = (await supabaseSelectFilter(
    'journal_lines',
    `journal_entry_id=in.(${idList})`,
    { select: 'account_code,account_name,side,amount', limit: 200000 }
  )) as { account_code?: string; account_name?: string | null; side?: string; amount?: number | string }[] | null

  const agg: Record<string, { debit: number; credit: number; name: string | null }> = {}
  for (const ln of lines || []) {
    const code = String(ln.account_code || '').trim()
    if (!code) continue
    const amt = Math.abs(Number(ln.amount) || 0)
    if (!agg[code]) agg[code] = { debit: 0, credit: 0, name: ln.account_name != null ? String(ln.account_name) : null }
    const side = String(ln.side || '').toLowerCase()
    if (side === 'debit') agg[code].debit += amt
    else if (side === 'credit') agg[code].credit += amt
    if (!agg[code].name && ln.account_name) agg[code].name = String(ln.account_name)
  }

  const rows: TrialBalanceRow[] = Object.keys(agg)
    .sort()
    .map((accountCode) => {
      const { debit, credit, name } = agg[accountCode]
      const meta = CHART_OF_ACCOUNTS_BY_CODE[accountCode]
      const accountName = name || meta?.nameKo || null
      return {
        accountCode,
        accountName,
        debit,
        credit,
        netDebit: debit - credit,
      }
    })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    rows,
    totalDebit,
    totalCredit,
    diff: totalDebit - totalCredit,
  }
}
