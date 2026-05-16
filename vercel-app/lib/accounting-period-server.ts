import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  ACCOUNTING_PERIOD_ALL_SCOPE,
  isAccountingPeriodAllScope,
  normalizeAccountingPeriodStoreScope,
} from '@/lib/accounting-period-store-scope'

type PeriodRow = {
  year_month?: string
  store_scope?: string | null
  is_closed?: boolean
}

async function fetchPeriodRows(yearMonth: string): Promise<PeriodRow[]> {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return []
  try {
    const rows = (await supabaseSelectFilter('accounting_periods', `year_month=eq.${encodeURIComponent(ym)}`, {
      select: 'year_month,store_scope,is_closed',
      limit: 50,
    })) as PeriodRow[] | null
    return rows || []
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('store_scope') || msg.includes('42703')) {
      const legacy = (await supabaseSelectFilter('accounting_periods', `year_month=eq.${encodeURIComponent(ym)}`, {
        select: 'year_month,is_closed',
        limit: 1,
      })) as { year_month?: string; is_closed?: boolean }[] | null
      return (legacy || []).map((r) => ({
        year_month: r.year_month,
        store_scope: ACCOUNTING_PERIOD_ALL_SCOPE,
        is_closed: r.is_closed,
      }))
    }
    return []
  }
}

/** 매장 마감 또는 전사(All) 마감이면 true */
export async function isAccountingPeriodClosed(
  yearMonth: string,
  storeFilter?: string | null
): Promise<boolean> {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return false
  const storeScope = await normalizeAccountingPeriodStoreScope(storeFilter)
  const rows = await fetchPeriodRows(ym)
  if (!rows.length) return false

  if (!isAccountingPeriodAllScope(storeScope)) {
    const storeRow = rows.find((r) => String(r.store_scope || '').trim() === storeScope)
    if (storeRow) return Boolean(storeRow.is_closed)
  }
  const allRow = rows.find((r) => isAccountingPeriodAllScope(String(r.store_scope || '')))
  return Boolean(allRow?.is_closed)
}

export type AccountingPeriodCloseSnapshot = {
  yearMonth: string
  storeScope: string
  isClosed: boolean
  closedViaAll: boolean
}

export async function getAccountingPeriodCloseSnapshot(
  yearMonth: string,
  storeFilter?: string | null
): Promise<AccountingPeriodCloseSnapshot> {
  const ym = String(yearMonth || '').slice(0, 7)
  const storeScope = await normalizeAccountingPeriodStoreScope(storeFilter)
  const rows = await fetchPeriodRows(ym)
  const allRow = rows.find((r) => isAccountingPeriodAllScope(String(r.store_scope || '')))
  const storeRow = isAccountingPeriodAllScope(storeScope)
    ? null
    : rows.find((r) => String(r.store_scope || '').trim() === storeScope)
  const closedViaAll = Boolean(allRow?.is_closed)
  const closedViaStore = Boolean(storeRow?.is_closed)
  return {
    yearMonth: ym,
    storeScope,
    isClosed: closedViaStore || closedViaAll,
    closedViaAll: closedViaAll && !closedViaStore,
  }
}

function isMissingStoreScopeColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('store_scope') || msg.includes('42703')
}

function isMissingUnlockColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('unlocked_at') ||
    msg.includes('unlocked_by') ||
    msg.includes('unlock_reason') ||
    msg.includes('unlock_approved_by')
  )
}

export type AccountingPeriodUpsertRow = {
  year_month: string
  store_scope: string
  is_closed: boolean
  closed_at: string | null
  closed_by: string | null
  unlocked_at?: string | null
  unlocked_by?: string | null
  unlock_reason?: string | null
  unlock_approved_by?: string | null
}

/** DB 스키마(마이그레이션 전·후)에 맞춰 upsert */
export async function upsertAccountingPeriodRecord(row: AccountingPeriodUpsertRow): Promise<void> {
  const tryUpsert = async (payload: Record<string, unknown>, onConflict: string) => {
    await supabaseUpsert('accounting_periods', [payload], onConflict)
  }
  try {
    await tryUpsert(row, 'year_month,store_scope')
    return
  } catch (e) {
    if (isMissingUnlockColumnError(e)) {
      const { unlocked_at, unlocked_by, unlock_reason, unlock_approved_by, ...slim } = row
      try {
        await tryUpsert(slim, 'year_month,store_scope')
        return
      } catch (e2) {
        if (!isMissingStoreScopeColumnError(e2)) throw e2
      }
    } else if (!isMissingStoreScopeColumnError(e)) {
      throw e
    }
  }
  const { store_scope, unlocked_at, unlocked_by, unlock_reason, unlock_approved_by, ...legacy } = row
  await tryUpsert(legacy, 'year_month')
}
