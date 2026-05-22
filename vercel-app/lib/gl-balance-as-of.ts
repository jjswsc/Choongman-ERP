import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'

export type GlBalanceRow = {
  accountCode: string
  debitTotal: number
  creditTotal: number
  balance: number
}

const DEFAULT_CODES = ['1010', '1130', '2110'] as const

function isMissingGlBalanceRpc(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_gl_balance_as_of') || msg.includes('42883')
}

function signedBalanceForCode(accountCode: string, debit: number, credit: number): number {
  const meta = CHART_OF_ACCOUNTS_BY_CODE[accountCode]
  const normal = meta?.normalSide || 'debit'
  if (normal === 'credit') return credit - debit
  return debit - credit
}

/** journal_lines 페이지 합산 폴백 (RPC 미배포 시) */
async function sumGlBalancesSelectFallback(params: {
  endStr: string
  storeFilter: string
  accountCodes: string[]
}): Promise<GlBalanceRow[]> {
  const { endStr, storeFilter, accountCodes } = params
  const jeFilter = `accounting_date=lte.${encodeURIComponent(endStr)}`
  const entries = (await supabaseSelectFilterAllPages('journal_entries', jeFilter, {
    select: 'id,store_name',
    pageSize: 5000,
    maxRows: 200_000,
  })) as { id?: number; store_name?: string | null }[]

  const ids = (entries || [])
    .filter((e) => storeMatchesIncomeFilter(String(e.store_name || ''), storeFilter))
    .map((e) => Number(e.id))
    .filter((id) => id > 0)

  if (ids.length === 0) {
    return accountCodes.map((accountCode) => ({
      accountCode,
      debitTotal: 0,
      creditTotal: 0,
      balance: 0,
    }))
  }

  const agg: Record<string, { debit: number; credit: number }> = {}
  for (const code of accountCodes) agg[code] = { debit: 0, credit: 0 }

  const chunk = 400
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const idList = slice.join(',')
    const codeOr = accountCodes.map((c) => `account_code.eq.${c}`).join(',')
    const lines = (await supabaseSelectFilterAllPages(
      'journal_lines',
      `journal_entry_id=in.(${idList})&or=(${codeOr})`,
      { select: 'account_code,side,amount', pageSize: 8000, maxRows: 500_000 }
    )) as { account_code?: string; side?: string; amount?: number }[]

    for (const ln of lines || []) {
      const code = String(ln.account_code || '').trim()
      if (!code || !agg[code]) continue
      const amt = Math.abs(Number(ln.amount) || 0)
      const side = String(ln.side || '').toLowerCase()
      if (side === 'debit') agg[code].debit += amt
      else if (side === 'credit') agg[code].credit += amt
    }
  }

  return accountCodes.map((accountCode) => {
    const { debit, credit } = agg[accountCode] || { debit: 0, credit: 0 }
    return {
      accountCode,
      debitTotal: debit,
      creditTotal: credit,
      balance: signedBalanceForCode(accountCode, debit, credit),
    }
  })
}

export async function getGlBalancesAsOf(params: {
  endStr: string
  storeFilter: string
  accountCodes?: string[]
}): Promise<{ rows: GlBalanceRow[]; source: 'rpc' | 'select' }> {
  const endStr = String(params.endStr || '').slice(0, 10)
  const storeFilter = params.storeFilter && params.storeFilter !== '' ? params.storeFilter : 'All'
  const accountCodes = params.accountCodes?.length ? params.accountCodes : [...DEFAULT_CODES]

  try {
    const rows = (await supabaseRpc<{
      account_code?: string
      debit_total?: number
      credit_total?: number
      balance?: number
    }[]>('get_gl_balance_as_of', {
      p_end_date: endStr,
      p_store_filter: storeFilter,
      p_account_codes: accountCodes,
    })) as {
      account_code?: string
      debit_total?: number
      credit_total?: number
      balance?: number
    }[] | null

    const mapped = (rows || []).map((r) => ({
      accountCode: String(r.account_code || '').trim(),
      debitTotal: Number(r.debit_total) || 0,
      creditTotal: Number(r.credit_total) || 0,
      balance: Number(r.balance) || 0,
    }))
    const byCode = new Map(mapped.map((r) => [r.accountCode, r]))
    const normalized = accountCodes.map(
      (code) =>
        byCode.get(code) || {
          accountCode: code,
          debitTotal: 0,
          creditTotal: 0,
          balance: 0,
        }
    )
    return { rows: normalized, source: 'rpc' }
  } catch (e) {
    if (!isMissingGlBalanceRpc(e)) throw e
  }

  const rows = await sumGlBalancesSelectFallback({ endStr, storeFilter, accountCodes })
  return { rows, source: 'select' }
}

export function glBalanceForCode(rows: GlBalanceRow[], code: string): number {
  const row = rows.find((r) => r.accountCode === code)
  return Math.max(0, Number(row?.balance) || 0)
}
