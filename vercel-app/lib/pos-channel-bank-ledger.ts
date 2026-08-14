/**
 * 채널 확인 — 매장 통장(bank_accounts.store) × 계정과목으로 입금 조회.
 * 행의 store_name이 비어도, 그 매장 계좌에 찍힌 4111/4112/4113/4130/4140을 그 매장 분으로 본다.
 */
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'
import { rowMatchesAnySalesStoreSelection } from '@/lib/pos-sales-store-filter'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { supabaseSelectFilterAllPagesStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export const CHANNEL_BANK_GL_CODES = {
  grab: '4111',
  lineman: '4112',
  shopee: '4113',
  qr: '4130',
  cash: '4140',
} as const

export type ChannelBankGlKind = keyof typeof CHANNEL_BANK_GL_CODES

export const DELIVERY_APP_BANK_GL_CODES = [
  CHANNEL_BANK_GL_CODES.grab,
  CHANNEL_BANK_GL_CODES.lineman,
  CHANNEL_BANK_GL_CODES.shopee,
] as const

export type ChannelBankAccountRef = { id: number; store: string }

export type ChannelBankLedgerRow = {
  transDate?: string | null
  salesDate?: string | null
  transType?: string | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  category?: string | null
  accountStore: string
  accountSubjectCode?: string | null
}

type BankAccountRow = { id?: number; store?: string | null }
type BankTxRow = {
  id?: number
  account_id?: number
  trans_date?: string
  sales_date?: string | null
  trans_type?: string
  amount?: number
  memo?: string | null
  note?: string | null
  category?: string | null
  account_subject_id?: number | null
}

export function filterBankAccountsForSalesStores(
  accounts: BankAccountRow[],
  storeCodes: string[]
): ChannelBankAccountRef[] {
  const wanted = (storeCodes || []).map((s) => String(s || '').trim()).filter(Boolean)
  const out: ChannelBankAccountRef[] = []
  for (const row of accounts) {
    const id = Number(row.id) || 0
    const store = String(row.store || '').trim()
    if (!id || !store) continue
    if (wanted.length > 0 && !rowMatchesAnySalesStoreSelection(store, wanted)) continue
    out.push({ id, store })
  }
  return out
}

export async function loadAccountSubjectCodeById(codes: string[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const list = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))]
  if (list.length === 0) return map
  try {
    const rows = (await supabaseSelectFilter('account_subjects', `code=in.(${list.join(',')})`, {
      select: 'id,code',
      limit: 50,
    })) as { id?: number; code?: string }[] | null
    for (const r of rows || []) {
      const id = Number(r.id) || 0
      const code = String(r.code || '').trim()
      if (id && code) map.set(id, code)
    }
  } catch {
    /* 계정과목 조회 실패 시 빈 맵 */
  }
  return map
}

async function loadBankAccounts(tenantScope: SaasTenantScope): Promise<BankAccountRow[]> {
  if (isSaasTenantQueryBlocked(tenantScope, 'bank_accounts')) return []
  try {
    const rows = (await supabaseSelectFilter(
      'bank_accounts',
      appendSaasTenantFilter('id=gt.0', tenantScope, 'bank_accounts'),
      { select: 'id,store', limit: 500, order: 'id.asc' }
    )) as BankAccountRow[] | null
    return rows || []
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('bank_accounts')
    return []
  }
}

/** 매장 통장 입금 — 선택 매장 계좌 + 계정과목(GL)만 */
export async function fetchStoreAccountDeposits(params: {
  tenantScope: SaasTenantScope
  storeCodes: string[]
  startStr: string
  endStr: string
  transDateWindow: { from: string; to: string }
  glCodes: string[]
  queryLabel: string
}): Promise<ChannelBankLedgerRow[]> {
  const empty: ChannelBankLedgerRow[] = []
  const start = String(params.startStr || '').slice(0, 10)
  const end = String(params.endStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty
  if (isSaasTenantQueryBlocked(params.tenantScope, 'bank_transactions')) return empty

  const glById = await loadAccountSubjectCodeById(params.glCodes)
  const subjectIds = [...glById.keys()]
  if (subjectIds.length === 0) return empty

  const accounts = filterBankAccountsForSalesStores(
    await loadBankAccounts(params.tenantScope),
    params.storeCodes
  )
  if (accounts.length === 0) return empty

  const storeByAccountId = new Map(accounts.map((a) => [a.id, a.store]))
  const accountIds = accounts.map((a) => a.id)
  const window = params.transDateWindow
  const base = `trans_type=eq.deposit&account_id=in.(${accountIds.join(',')})&account_subject_id=in.(${subjectIds.join(',')})`
  const select =
    'id,account_id,trans_date,sales_date,trans_type,amount,memo,note,category,account_subject_id'
  const bySalesDate = `${base}&sales_date=gte.${encodeURIComponent(start)}&sales_date=lte.${encodeURIComponent(end)}`
  const byTransDate = `${base}&trans_date=gte.${encodeURIComponent(window.from)}&trans_date=lte.${encodeURIComponent(window.to)}`

  const load = async (filter: string) =>
    (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
      'bank_transactions',
      appendSaasTenantFilter(filter, params.tenantScope, 'bank_transactions'),
      { select, order: 'id.asc', maxRows: 20_000 },
      params.queryLabel
    )) as BankTxRow[]

  try {
    const seen = new Set<number>()
    const rows: BankTxRow[] = []
    const pushUnique = (list: BankTxRow[] | null | undefined) => {
      for (const r of list || []) {
        const id = Number(r.id) || 0
        if (id && seen.has(id)) continue
        if (id) seen.add(id)
        rows.push(r)
      }
    }
    try {
      const [a, b] = await Promise.all([load(bySalesDate), load(byTransDate)])
      pushUnique(a)
      pushUnique(b)
    } catch {
      pushUnique(await load(byTransDate))
    }

    const out: ChannelBankLedgerRow[] = []
    for (const r of rows) {
      if (isExpenseInternalBankNote(r.note)) continue
      const accountStore = storeByAccountId.get(Number(r.account_id) || 0) || ''
      if (!accountStore) continue
      const sid = Number(r.account_subject_id) || 0
      out.push({
        transDate: r.trans_date,
        salesDate: r.sales_date,
        transType: r.trans_type,
        amount: r.amount,
        memo: r.memo,
        note: r.note,
        category: r.category,
        accountStore,
        accountSubjectCode: sid ? glById.get(sid) || null : null,
      })
    }
    return out
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('bank_transactions')
    return empty
  }
}

export function ledgerRowToBankDepositInput(row: ChannelBankLedgerRow): {
  transDate?: string | null
  salesDate?: string | null
  transType?: string | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  category?: string | null
  accountStore?: string | null
  storeName?: string | null
  store?: string | null
  accountSubjectCode?: string | null
} {
  return {
    transDate: row.transDate,
    salesDate: row.salesDate,
    transType: row.transType,
    amount: row.amount,
    memo: row.memo,
    note: row.note,
    category: row.category,
    accountStore: row.accountStore,
    accountSubjectCode: row.accountSubjectCode,
  }
}
