import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { ensureErpStoreMatchIndex, storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { createAsyncTtlShare } from '@/lib/async-ttl-share'

const GL_FALLBACK_MAX_ROWS = 1_000_000

export type GlBalanceRow = {
  accountCode: string
  debitTotal: number
  creditTotal: number
  balance: number
}

const DEFAULT_CODES = ['1010', '1130', '2110', '2150', '1150'] as const

function isMissingGlBalanceRpc(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_gl_balance_as_of') || msg.includes('42883')
}

function isMissingGlBalanceByStoreRpc(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('get_gl_balance_by_store_as_of') || msg.includes('42883') || msg.includes('pgrst202')
}

function signedBalanceForCode(accountCode: string, debit: number, credit: number): number {
  const meta = CHART_OF_ACCOUNTS_BY_CODE[accountCode]
  const normal = meta?.normalSide || 'debit'
  if (normal === 'credit') return credit - debit
  return debit - credit
}

function toGlBalanceRows(
  accountCodes: string[],
  agg: Record<string, { debit: number; credit: number }>
): GlBalanceRow[] {
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

/**
 * DB에서 매장명(store_name)별로만 합산하고 매장 매칭은 JS(storeMatchesIncomeFilter)로 —
 * select 폴백과 같은 기준. RPC: sql/get_gl_balance_by_store_as_of.sql
 */
async function sumGlBalancesByStoreRpc(params: {
  endStr: string
  storeFilter: string
  accountCodes: string[]
}): Promise<GlBalanceRow[]> {
  const { endStr, storeFilter, accountCodes } = params
  const rows = (await supabaseRpc<{
    store_name?: string | null
    account_code?: string
    debit_total?: number
    credit_total?: number
  }[]>('get_gl_balance_by_store_as_of', {
    p_end_date: endStr,
    p_account_codes: accountCodes,
  })) as {
    store_name?: string | null
    account_code?: string
    debit_total?: number
    credit_total?: number
  }[] | null

  const agg: Record<string, { debit: number; credit: number }> = {}
  for (const code of accountCodes) agg[code] = { debit: 0, credit: 0 }
  for (const r of rows || []) {
    const code = String(r.account_code || '').trim()
    if (!code || !agg[code]) continue
    if (!storeMatchesIncomeFilter(String(r.store_name || ''), storeFilter)) continue
    agg[code].debit += Number(r.debit_total) || 0
    agg[code].credit += Number(r.credit_total) || 0
  }
  return toGlBalanceRows(accountCodes, agg)
}

type JournalEntryStoreRow = { id?: number; store_name?: string | null }

const journalEntriesShare = createAsyncTtlShare<JournalEntryStoreRow[]>(60_000, 24)

/** 복수 매장 롤업(매장마다 호출)에서 같은 기말일 분개 헤더를 한 번만 읽는다 */
function loadJournalEntryStoresAsOf(endStr: string): Promise<JournalEntryStoreRow[]> {
  return journalEntriesShare(
    endStr,
    () =>
      supabaseSelectFilterAllPages('journal_entries', `accounting_date=lte.${encodeURIComponent(endStr)}`, {
        select: 'id,store_name',
        order: 'id.asc',
        pageSize: 5000,
        maxRows: GL_FALLBACK_MAX_ROWS,
      }) as Promise<JournalEntryStoreRow[]>
  )
}

/** journal_lines 페이지 합산 폴백 (RPC 미배포 시) */
async function sumGlBalancesSelectFallback(params: {
  endStr: string
  storeFilter: string
  accountCodes: string[]
}): Promise<GlBalanceRow[]> {
  const { endStr, storeFilter, accountCodes } = params
  const entries = await loadJournalEntryStoresAsOf(endStr)

  const idsByStore = new Map<string, number[]>()
  for (const e of entries || []) {
    const id = Number(e.id)
    if (!(id > 0)) continue
    const store = String(e.store_name || '')
    const bucket = idsByStore.get(store)
    if (bucket) bucket.push(id)
    else idsByStore.set(store, [id])
  }
  const ids: number[] = []
  for (const [store, storeIds] of idsByStore) {
    if (!storeMatchesIncomeFilter(store, storeFilter)) continue
    for (const id of storeIds) ids.push(id)
  }
  ids.sort((a, b) => a - b)

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
      { select: 'account_code,side,amount', pageSize: 8000, maxRows: GL_FALLBACK_MAX_ROWS }
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

  return toGlBalanceRows(accountCodes, agg)
}

export async function getGlBalancesAsOf(params: {
  endStr: string
  storeFilter: string
  accountCodes?: string[]
}): Promise<{ rows: GlBalanceRow[]; source: 'rpc' | 'select' }> {
  const endStr = String(params.endStr || '').slice(0, 10)
  const storeFilter = params.storeFilter && params.storeFilter !== '' ? params.storeFilter : 'All'
  const accountCodes = params.accountCodes?.length ? params.accountCodes : [...DEFAULT_CODES]
  if (storeFilter !== 'All') {
    try {
      await ensureErpStoreMatchIndex()
    } catch {
      /* 매장 마스터 조회 실패 시 storeMatchesIncomeFilter 레거시 매칭 */
    }
  }

  try {
    const rows = await sumGlBalancesByStoreRpc({ endStr, storeFilter, accountCodes })
    return { rows, source: 'rpc' }
  } catch (e) {
    if (!isMissingGlBalanceByStoreRpc(e)) throw e
  }

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
