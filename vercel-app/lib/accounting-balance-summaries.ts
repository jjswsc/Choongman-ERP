import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { sqlIlikeContains, storeMatchesIncomeFilter } from '@/lib/accounting-store-match'

const ACCOUNTING_FALLBACK_MAX_ROWS = 2_000_000

function isMissingBalanceRpcError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('get_receivable_summary') ||
    msg.includes('get_payable_summary') ||
    msg.includes('42883')
  )
}

/** 미수금 잔액 — RPC 우선, 실패 시 전건 페이지 합산 */
export async function sumReceivablesBalance(params: {
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<{ total: number; source: 'rpc' | 'select' }> {
  const { endStr, storeFilter, isHQ } = params
  try {
    const rows = (await supabaseRpc<{ store_name: string; balance: number }[]>('get_receivable_summary', {
      p_store_filter: null,
      p_end_str: endStr || null,
    })) as { store_name?: string; balance?: number }[] | null
    let total = 0
    for (const r of rows || []) {
      if (!isHQ && storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(String(r.store_name || ''), storeFilter)) continue
      }
      total += Number(r.balance) || 0
    }
    return { total, source: 'rpc' }
  } catch (e) {
    if (!isMissingBalanceRpcError(e)) throw e
  }

  let filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
  if (!isHQ && storeFilter !== 'All') {
    filter += `&store_name=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`
  }
  const rows = (await supabaseSelectFilterAllPages('receivable_transactions', filter, {
    select: 'amount',
    pageSize: 8000,
    maxRows: ACCOUNTING_FALLBACK_MAX_ROWS,
  })) as { amount?: number }[]
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  return { total, source: 'select' }
}

/** 미지급금 잔액 — 전체는 RPC, 매장 스코프는 store 필터 페이지 합산 */
export async function sumPayablesBalance(params: {
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<{ total: number; source: 'rpc' | 'select' }> {
  const { endStr, storeFilter, isHQ } = params
  const useStoreScoped = !isHQ && storeFilter !== 'All'

  if (!useStoreScoped) {
    try {
      const rows = (await supabaseRpc<{ balance: number }[]>('get_payable_summary', {
        p_vendor_filter: null,
        p_end_str: endStr || null,
      })) as { balance?: number }[] | null
      const total = (rows || []).reduce((sum, r) => sum + (Number(r.balance) || 0), 0)
      return { total, source: 'rpc' }
    } catch (e) {
      if (!isMissingBalanceRpcError(e)) throw e
    }
  }

  let filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
  if (useStoreScoped) {
    filter += `&store_name=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`
  }
  let rows: { amount?: number }[] = []
  try {
    rows = (await supabaseSelectFilterAllPages('payable_transactions', filter, {
      select: 'amount',
      pageSize: 8000,
      maxRows: ACCOUNTING_FALLBACK_MAX_ROWS,
    })) as { amount?: number }[]
  } catch (firstErr) {
    if (!useStoreScoped) throw firstErr
    const fallback = filter.replace('store_name', 'store')
    rows = (await supabaseSelectFilterAllPages('payable_transactions', fallback, {
      select: 'amount',
      pageSize: 8000,
      maxRows: ACCOUNTING_FALLBACK_MAX_ROWS,
    })) as { amount?: number }[]
  }
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  return { total, source: 'select' }
}

/** 통장 거래 누적 합(말일 기준) — 페이지 합산 */
export async function sumBankTransactionsForAccounts(
  accountIds: number[],
  endStr: string
): Promise<{ total: number; truncated: boolean }> {
  if (accountIds.length === 0) return { total: 0, truncated: false }
  const idList = accountIds.join(',')
  const filter = `account_id=in.(${idList})&trans_date=lte.${endStr}`
  const rows = (await supabaseSelectFilterAllPages('bank_transactions', filter, {
    select: 'amount',
    pageSize: 8000,
    maxRows: ACCOUNTING_FALLBACK_MAX_ROWS,
  })) as { amount?: number }[]
  const cap = ACCOUNTING_FALLBACK_MAX_ROWS
  return {
    total: rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    truncated: rows.length >= cap,
  }
}
