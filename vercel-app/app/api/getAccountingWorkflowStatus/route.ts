import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { workflowStoreScopeFromStoreTb } from '@/lib/accounting-ledger-store-filter'
import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function parsePeriodType(v: unknown): 'monthly' | 'half_year' | 'annual' {
  const raw = String(v || '').trim().toLowerCase()
  return raw === 'half_year' || raw === 'annual' ? raw : 'monthly'
}

function isMissingWorkflowPeriodColumnsError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('period_type') ||
    msg.includes('period_key') ||
    msg.includes('42703') ||
    msg.includes('column')
  )
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const periodType = parsePeriodType(searchParams.get('periodType'))
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(auth.store || '').trim())
  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  let storeFilter = requestedStoreFilter
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
      if (!storeFilter) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }
  const storeScope = workflowStoreScopeFromStoreTb(storeFilter || 'All')
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    let rows: Record<string, unknown>[] | null = null
    let fallbackUsed = false
    try {
      rows = (await supabaseSelectFilter(
        'accounting_filing_workflow_status',
        [
          `period_type=eq.${encodeURIComponent(periodType)}`,
          `period_key=eq.${encodeURIComponent(period.periodKey)}`,
          `store_scope=eq.${encodeURIComponent(storeScope)}`,
        ].join('&'),
        {
          select: 'id,year_month,period_type,period_key,filing_type,status,note,owner,updated_by,updated_at,store_scope',
          limit: 200,
          order: 'filing_type.asc',
        }
      )) as Record<string, unknown>[] | null
    } catch (e) {
      if (!isMissingWorkflowPeriodColumnsError(e)) throw e
      fallbackUsed = true
      console.warn('getAccountingWorkflowStatus fallback: missing period columns')
      const fallbackFilter =
        periodType === 'monthly'
          ? `year_month=eq.${encodeURIComponent(yearMonth)}&store_scope=eq.${encodeURIComponent(storeScope)}`
          : `year_month=in.(${period.months
              .map((m) => encodeURIComponent(m))
              .join(',')})&store_scope=eq.${encodeURIComponent(storeScope)}`
      const oldRows = (await supabaseSelectFilter('accounting_filing_workflow_status', fallbackFilter, {
        select: 'id,year_month,filing_type,status,note,owner,updated_by,updated_at,store_scope',
        limit: 500,
        order: 'updated_at.desc,id.desc',
      })) as Record<string, unknown>[] | null
      const dedup = new Map<string, Record<string, unknown>>()
      for (const row of oldRows || []) {
        const key = String(row.filing_type || '')
        if (!key || dedup.has(key)) continue
        dedup.set(key, {
          ...row,
          period_type: periodType,
          period_key: period.periodKey,
        })
      }
      rows = Array.from(dedup.values()).sort((a, b) =>
        String(a.filing_type || '').localeCompare(String(b.filing_type || ''))
      )
    }
    return NextResponse.json({ rows: rows || [], fallbackUsed }, { headers })
  } catch (e) {
    console.error('getAccountingWorkflowStatus:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

