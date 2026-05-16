import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import {
  ACCOUNTING_PERIOD_ALL_SCOPE,
  isAccountingPeriodAllScope,
  normalizeAccountingPeriodStoreScope,
} from '@/lib/accounting-period-store-scope'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { requireAuth } from '@/lib/verify-auth'

function lastNYearMonths(n: number): string[] {
  const end = getBangkokTodayDateString()
  const y = Number(end.slice(0, 4))
  const m = Number(end.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    let yy = y
    let mm = m - i
    while (mm < 1) {
      mm += 12
      yy -= 1
    }
    out.push(`${yy}-${String(mm).padStart(2, '0')}`)
  }
  return out
}

type AccountingPeriodRow = {
  year_month?: string
  store_scope?: string | null
  is_closed?: boolean
  closed_at?: string | null
  closed_by?: string | null
  unlocked_at?: string | null
  unlocked_by?: string | null
  unlock_reason?: string | null
  unlock_approved_by?: string | null
}

type PeriodMeta = {
  is_closed: boolean
  closed_at: string | null
  closed_by: string | null
  unlocked_at: string | null
  unlocked_by: string | null
  unlock_reason: string | null
  unlock_approved_by: string | null
}

function emptyMeta(): PeriodMeta {
  return {
    is_closed: false,
    closed_at: null,
    closed_by: null,
    unlocked_at: null,
    unlocked_by: null,
    unlock_reason: null,
    unlock_approved_by: null,
  }
}

function rowToMeta(r: AccountingPeriodRow): PeriodMeta {
  return {
    is_closed: Boolean(r.is_closed),
    closed_at: r.closed_at != null ? String(r.closed_at) : null,
    closed_by: r.closed_by != null ? String(r.closed_by) : null,
    unlocked_at: r.unlocked_at != null ? String(r.unlocked_at) : null,
    unlocked_by: r.unlocked_by != null ? String(r.unlocked_by) : null,
    unlock_reason: r.unlock_reason != null ? String(r.unlock_reason) : null,
    unlock_approved_by: r.unlock_approved_by != null ? String(r.unlock_approved_by) : null,
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  const { searchParams } = new URL(request.url)
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const storeScope = await normalizeAccountingPeriodStoreScope(
    requestedStoreFilter || ACCOUNTING_PERIOD_ALL_SCOPE
  )

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const months = lastNYearMonths(36)
    let rows: AccountingPeriodRow[] | null = null
    const selectWithScope =
      'year_month,store_scope,is_closed,closed_at,closed_by,unlocked_at,unlocked_by,unlock_reason,unlock_approved_by'
    const selectLegacy = 'year_month,is_closed,closed_at,closed_by'
    try {
      rows = (await supabaseSelect('accounting_periods', {
        select: selectWithScope,
        limit: 2000,
        order: 'year_month.desc',
      })) as AccountingPeriodRow[] | null
    } catch (e) {
      const msg = String(e || '').toLowerCase()
      if (msg.includes('store_scope') || msg.includes('42703')) {
        const legacy = (await supabaseSelect('accounting_periods', {
          select: selectLegacy,
          limit: 500,
          order: 'year_month.desc',
        })) as AccountingPeriodRow[] | null
        rows = (legacy || []).map((r) => ({ ...r, store_scope: ACCOUNTING_PERIOD_ALL_SCOPE }))
      } else if (
        msg.includes('unlocked_at') ||
        msg.includes('unlocked_by') ||
        msg.includes('unlock_reason') ||
        msg.includes('unlock_approved_by')
      ) {
        rows = (await supabaseSelect('accounting_periods', {
          select: 'year_month,store_scope,is_closed,closed_at,closed_by',
          limit: 2000,
          order: 'year_month.desc',
        })) as AccountingPeriodRow[] | null
      } else {
        throw e
      }
    }

    const byKey: Record<string, PeriodMeta> = {}
    for (const r of rows || []) {
      const ym = String(r.year_month || '').slice(0, 7)
      if (!ym) continue
      const scope = String(r.store_scope || ACCOUNTING_PERIOD_ALL_SCOPE).trim() || ACCOUNTING_PERIOD_ALL_SCOPE
      byKey[`${ym}|${scope}`] = rowToMeta(r)
    }

    const list = months.map((yearMonth) => {
      const allMeta = byKey[`${yearMonth}|${ACCOUNTING_PERIOD_ALL_SCOPE}`] || emptyMeta()
      const storeMeta = isAccountingPeriodAllScope(storeScope)
        ? null
        : byKey[`${yearMonth}|${storeScope}`] || emptyMeta()
      const closedViaAll = Boolean(allMeta.is_closed)
      const closedViaStore = Boolean(storeMeta?.is_closed)
      const isClosed = closedViaStore || closedViaAll
      const meta = closedViaStore && storeMeta ? storeMeta : allMeta
      return {
        yearMonth,
        storeScope,
        isClosed,
        closedViaAll: closedViaAll && !closedViaStore,
        closedAt: meta.closed_at,
        closedBy: meta.closed_by,
        unlockedAt: meta.unlocked_at,
        unlockedBy: meta.unlocked_by,
        unlockReason: meta.unlock_reason,
        unlockApprovedBy: meta.unlock_approved_by,
      }
    })

    return NextResponse.json({ periods: list, storeScope }, { headers })
  } catch (e) {
    console.error('getAccountingPeriods:', e)
    const months = lastNYearMonths(36)
    return NextResponse.json(
      {
        storeScope,
        periods: months.map((yearMonth) => ({
          yearMonth,
          storeScope,
          isClosed: false,
          closedViaAll: false,
          closedAt: null,
          closedBy: null,
          unlockedAt: null,
          unlockedBy: null,
          unlockReason: null,
          unlockApprovedBy: null,
        })),
      },
      { headers }
    )
  }
}
