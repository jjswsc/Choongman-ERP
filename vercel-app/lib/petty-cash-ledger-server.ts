/**
 * Petty cash 원장 조회 — 기간 필터를 DB에 걸어 20000 ASC 잘림으로 최근 월이 비는 문제 방지.
 * 기초잔액: RPC get_petty_cash_opening_balances 우선, 없으면 store,amount 페이징 합산.
 */
import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { PETTY_CASH_LIST_COLS } from '@/lib/postgrest-narrow-select'
import {
  selectWithSaasTenantFallback,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

export const PETTY_CASH_PERIOD_MAX_ROWS = 100_000
export const PETTY_CASH_OPENING_MAX_ROWS = 500_000

export type PettyCashLedgerRow = {
  id?: number
  store?: string
  trans_date?: string
  trans_type?: string
  amount?: number
  balance_after?: number | null
  memo?: string
  receipt_url?: string
  user_name?: string
  account_subject_id?: number | null
  invoice_received?: boolean
  invoice_no?: string | null
  invoice_photo_url?: string | null
  vat_amount?: number | null
  vendor_code?: string | null
}

export function toPettyCashDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  // DATE만 오면 보통 문자열이지만, Date면 UTC 일자로 자르면 방콕 새벽이 전날로 밀릴 수 있어 en-CA+방콕 사용
  try {
    return val.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  } catch {
    return ''
  }
}

/** PostgREST store 범위 필터 (tenant 미포함) */
export function buildPettyCashStoreFilter(
  effectiveStore: string,
  departmentFilter = ''
): string {
  const store = String(effectiveStore || '').trim()
  if (!store) return 'id=gt.0'
  if (store === 'Office' && !String(departmentFilter || '').trim()) {
    return 'or=(store.eq.Office,store.eq.본사,store.eq.오피스,store.eq.본점,store.ilike.Office-%25)'
  }
  return 'store=eq.' + encodeURIComponent(store)
}

function joinFilters(...parts: (string | false | null | undefined)[]): string {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join('&')
}

type OpeningRpcRow = { store?: string; opening_balance?: number }

async function fetchOpeningBalancesViaSelect(
  beforeDate: string,
  storeBaseFilter: string,
  tenantScope: SaasTenantScope
): Promise<Record<string, number>> {
  const baseFilter = joinFilters(storeBaseFilter, `trans_date=lt.${beforeDate}`)
  const rows = await selectWithSaasTenantFallback(
    'petty_cash_transactions',
    tenantScope,
    baseFilter,
    async (filter) =>
      (await supabaseSelectFilterAllPages('petty_cash_transactions', filter, {
        select: 'store,amount',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: PETTY_CASH_OPENING_MAX_ROWS,
      })) as { store?: string; amount?: number }[]
  )
  const out: Record<string, number> = {}
  for (const r of rows || []) {
    const store = String(r.store || '').trim()
    if (!store) continue
    out[store] = (out[store] || 0) + (Number(r.amount) || 0)
  }
  return out
}

/** 조회 시작일 이전 매장별 잔액 합 */
export async function fetchPettyCashOpeningBalances(params: {
  beforeDate: string
  effectiveStore: string
  departmentFilter?: string
  tenantScope: SaasTenantScope
}): Promise<Record<string, number>> {
  const beforeDate = String(params.beforeDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) return {}

  const storeBaseFilter = buildPettyCashStoreFilter(
    params.effectiveStore,
    params.departmentFilter || ''
  )

  // Omni: RPC에 tenant 파라미터가 없어 select fallback (getPettyCashSummary와 동일)
  if (params.tenantScope.enforce && params.tenantScope.tenantId) {
    return fetchOpeningBalancesViaSelect(beforeDate, storeBaseFilter, params.tenantScope)
  }

  try {
    const rows = (await supabaseRpc<OpeningRpcRow[]>('get_petty_cash_opening_balances', {
      p_before_date: beforeDate,
      p_effective_store: String(params.effectiveStore || '').trim() || null,
      p_department_filter: String(params.departmentFilter || '').trim() || null,
    })) as OpeningRpcRow[] | null
    const list = Array.isArray(rows) ? rows : rows ? [rows] : []
    const out: Record<string, number> = {}
    for (const r of list) {
      const store = String(r.store || '').trim()
      if (!store) continue
      out[store] = Number(r.opening_balance) || 0
    }
    return out
  } catch (e) {
    console.warn('get_petty_cash_opening_balances fallback:', e)
    return fetchOpeningBalancesViaSelect(beforeDate, storeBaseFilter, params.tenantScope)
  }
}

/** 기간 내 원장 행 (DB 날짜 필터 + 페이지네이션) */
export async function fetchPettyCashRowsInPeriod(params: {
  startStr: string
  endStr: string
  effectiveStore: string
  departmentFilter?: string
  tenantScope: SaasTenantScope
}): Promise<PettyCashLedgerRow[]> {
  const startStr = String(params.startStr || '').slice(0, 10)
  const endStr = String(params.endStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return []
  }

  const storeBaseFilter = buildPettyCashStoreFilter(
    params.effectiveStore,
    params.departmentFilter || ''
  )
  const baseFilter = joinFilters(
    storeBaseFilter,
    `trans_date=gte.${startStr}`,
    `trans_date=lte.${endStr}`
  )

  return (await selectWithSaasTenantFallback(
    'petty_cash_transactions',
    params.tenantScope,
    baseFilter,
    async (filter) =>
      (await supabaseSelectFilterAllPages('petty_cash_transactions', filter, {
        select: PETTY_CASH_LIST_COLS,
        order: 'trans_date.asc,id.asc',
        pageSize: 5000,
        maxRows: PETTY_CASH_PERIOD_MAX_ROWS,
      })) as PettyCashLedgerRow[]
  )) as PettyCashLedgerRow[]
}

export type PettyCashLedgerListItem = {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number
  memo: string
  receipt_url?: string
  user_name: string
  account_subject_id?: number | null
  accountSubjectId?: number | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  vatAmount?: number
  vendorCode?: string
}

/** 기간 행 + 기초잔액으로 balance_after 계산 (날짜 ASC) */
export function buildPettyCashLedgerWithBalances(
  rows: PettyCashLedgerRow[],
  openingByStore: Record<string, number>
): PettyCashLedgerListItem[] {
  const storeBal: Record<string, number> = { ...openingByStore }
  const list: PettyCashLedgerListItem[] = []

  const sorted = [...(rows || [])].sort((a, b) => {
    const da = toPettyCashDateStr(a.trans_date)
    const db = toPettyCashDateStr(b.trans_date)
    const c = da.localeCompare(db)
    if (c !== 0) return c
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })

  for (const r of sorted) {
    const dt = toPettyCashDateStr(r.trans_date)
    if (!dt) continue
    const store = String(r.store || '').trim()
    if (!store) continue
    const amt = Number(r.amount) || 0
    if (!storeBal[store]) storeBal[store] = 0
    storeBal[store] += amt
    list.push({
      id: r.id || 0,
      store,
      trans_date: dt,
      trans_type: String(r.trans_type || 'expense').trim(),
      amount: amt,
      balance_after: storeBal[store],
      memo: String(r.memo || '').trim(),
      receipt_url: r.receipt_url ? String(r.receipt_url).trim() : undefined,
      user_name: String(r.user_name || '').trim(),
      account_subject_id: r.account_subject_id != null ? Number(r.account_subject_id) : null,
      accountSubjectId: r.account_subject_id != null ? Number(r.account_subject_id) : null,
      invoiceReceived: Boolean(r.invoice_received),
      ...(String(r.invoice_no || '').trim() ? { invoiceNo: String(r.invoice_no).trim() } : {}),
      ...(String(r.invoice_photo_url || '').trim()
        ? { invoicePhotoUrl: String(r.invoice_photo_url).trim() }
        : {}),
      ...(Number(r.vat_amount || 0) > 0 ? { vatAmount: Number(r.vat_amount) } : {}),
      ...(String(r.vendor_code || '').trim() ? { vendorCode: String(r.vendor_code).trim() } : {}),
    })
  }
  return list
}
