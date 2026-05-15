import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import {
  assertCanApproveAccountingCompliance,
  assertCanManageAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { syncTaxVatLedgersFromStockAndExpenses } from '@/lib/tax-ledger-auto-sync'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export const dynamic = 'force-dynamic'

function parseFilingStatus(v: unknown): '' | 'draft' | 'submitted' {
  const raw = String(v || '').trim().toLowerCase()
  if (raw === 'draft' || raw === 'submitted') return raw
  return ''
}

function normalizeLedgerFilingStatus(v: unknown): 'draft' | 'submitted' {
  return parseFilingStatus(v) === 'submitted' ? 'submitted' : 'draft'
}

function matchesFilingStatus(v: unknown, filter: '' | 'draft' | 'submitted'): boolean {
  if (!filter) return true
  return normalizeLedgerFilingStatus(v) === filter
}

function isMissingSubmissionColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('filing_status') ||
    msg.includes('submitted_at') ||
    msg.includes('submitted_by') ||
    msg.includes('created_by_employee_id') ||
    msg.includes('created_by_employee_code') ||
    msg.includes('submitted_by_employee_id') ||
    msg.includes('submitted_by_employee_code')
  )
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  delete next.created_by_employee_id
  delete next.created_by_employee_code
  delete next.submitted_by_employee_id
  delete next.submitted_by_employee_code
  return next
}

function monthStartYmd(ym: string): string {
  return `${ym}-01`
}

function monthEndYmd(ym: string): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${ym}-28`
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

async function syncInputVatFromExpensesForPeriod(params: {
  startMonth: string
  endMonth: string
  storeFilter: string
}): Promise<void> {
  const storeFilter = String(params.storeFilter || '').trim()
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
  const officeScope = !!storeFilter && isHeadOfficeLikeStoreName(storeFilter)
  const startYmd = monthStartYmd(params.startMonth)
  const endYmd = monthEndYmd(params.endMonth)
  const expParts = [
    `expense_date=gte.${encodeURIComponent(startYmd)}`,
    `expense_date=lte.${encodeURIComponent(endYmd)}`,
    'vat_amount=gt.0',
    'status=neq.rejected',
  ]
  const expenseRows = (await supabaseSelectFilterAllPages('expense_accruals', expParts.join('&'), {
    select: 'id,store_name',
    order: 'id.asc',
    pageSize: 2000,
    maxRows: 30000,
  })) as { id?: number; store_name?: string | null }[]
  for (const row of expenseRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue
    const rowStore = String(row.store_name || '').trim()
    if (storeFilter && !storeScope.matches(rowStore) && !(officeScope && !rowStore)) continue
    await syncExpenseAccrualInputVatLedger(id, officeScope && !rowStore ? { fallbackStoreName: storeFilter } : undefined)
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  try {
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const filingStatus = parseFilingStatus(searchParams.get('filingStatus'))
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(authResult.auth.store || '').trim()
  const isOfficeLevel =
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)
  let storeFilter = requestedStoreFilter
  if (storeFilter && (isOfficeStore(storeFilter) || isHeadOfficeLikeStoreName(storeFilter))) {
    storeFilter = 'All'
  }
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
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const initialRows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
      select: '*',
      order: 'doc_date.asc,id.asc',
      pageSize: 4000,
      maxRows: 100000,
    })) as Record<string, unknown>[] | null
    const initialStoreScope = await createAccountingStoreScopeMatcher(storeFilter)
    const initialEntries = (initialRows || []).filter((row) => {
      if (!initialStoreScope.matches(String(row.store_name || ''))) return false
      return matchesFilingStatus(row.filing_status, filingStatus)
    })
    if (initialEntries.length > 0) {
      const hasInputEntries = initialEntries.some(
        (row) => String(row.direction || '').trim().toLowerCase() === 'input'
      )
      if (!hasInputEntries) {
        // 매출 등만 있고 매입 행이 없을 때: 지출 기반 매입만 채우면 입고(stock_logs Inbound) 매입이
        // 영구히 빠진 채로 조기 반환되는 문제가 있어, 입고·지출 통합 동기화도 같이 돌린다.
        try {
          await syncInputVatFromExpensesForPeriod({
            startMonth: period.startMonth,
            endMonth: period.endMonth,
            storeFilter,
          })
        } catch (e) {
          console.warn('vatLedger GET expense-input quick sync skipped:', e)
        }
        try {
          await syncTaxVatLedgersFromStockAndExpenses({
            months: period.months,
            storeFilter,
          })
        } catch (e) {
          console.warn('vatLedger GET stock+expense auto-sync skipped:', e)
        }
        try {
          const refreshedRows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
            select: '*',
            order: 'doc_date.asc,id.asc',
            pageSize: 4000,
            maxRows: 100000,
          })) as Record<string, unknown>[] | null
          const refreshedEntries = (refreshedRows || []).filter((row) => {
            if (!initialStoreScope.matches(String(row.store_name || ''))) return false
            return matchesFilingStatus(row.filing_status, filingStatus)
          })
          return NextResponse.json({ entries: refreshedEntries, period }, { headers })
        } catch (e) {
          console.warn('vatLedger GET refresh after input backfill failed:', e)
        }
      }
      return NextResponse.json({ entries: initialEntries, period }, { headers })
    }
    try {
      await syncTaxVatLedgersFromStockAndExpenses({
        months: period.months,
        storeFilter,
      })
    } catch (e) {
      console.warn('vatLedger GET auto-sync skipped:', e)
    }
    const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
      select: '*',
      order: 'doc_date.asc,id.asc',
      pageSize: 4000,
      maxRows: 100000,
    })) as Record<string, unknown>[] | null
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const entries = (rows || []).filter((row) => {
      if (!storeScope.matches(String(row.store_name || ''))) return false
      return matchesFilingStatus(row.filing_status, filingStatus)
    })
    return NextResponse.json({ entries, period }, { headers })
  } catch (e) {
    console.error('vatLedger GET:', e)
    return NextResponse.json({ entries: [], error: 'QUERY_FAILED' }, { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const jwtUserRole = String(authResult.auth.role || '').trim()
  const jwtAllowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  try {
    const body = await request.json().catch(() => ({}))
    const actorName = String(authResult.auth.name || body.createdBy || '').trim() || null
    const actorEmployeeId =
      authResult.auth.employeeId != null && Number.isFinite(Number(authResult.auth.employeeId))
        ? Math.floor(Number(authResult.auth.employeeId))
        : null
    const actorEmployeeCode = String(authResult.auth.employeeCode || '').trim() || null
    const userRole = jwtUserRole
    const userStore = String(authResult.auth.store || '').trim()
    const isOfficeLevel =
      isOfficeRole(userRole) ||
      isAccountingRole(userRole) ||
      isOfficeStore(userStore) ||
      isHeadOfficeLikeStoreName(userStore)
    const requestedStoreName = body.storeName != null ? String(body.storeName).trim() : ''
    if (!isOfficeLevel && requestedStoreName) {
      const allowed = jwtAllowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreName))
      if (!allowed) {
        return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
    const effectiveStoreName = isOfficeLevel
      ? (requestedStoreName || null)
      : (requestedStoreName || String(jwtAllowedStores[0] || '').trim() || null)
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))

    const id = body.id != null ? Number(body.id) : 0
    const docDate = String(body.docDate || body.doc_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    const direction = String(body.direction || '').toLowerCase()
    const filingStatus = normalizeLedgerFilingStatus(body.filingStatus ?? body.filing_status)
    if (filingStatus === 'submitted') assertCanApproveAccountingCompliance(userRole)
    else assertCanWriteAccountingCompliance(userRole)
    const submittedAtRaw = String((body.submittedAt ?? body.submitted_at ?? '') || '').trim()
    const submittedByRaw = String((body.submittedBy ?? body.submitted_by ?? body.createdBy ?? actorName ?? '') || '').trim()
    if (!docDate || !/^\d{4}-\d{2}$/.test(taxMonth) || (direction !== 'output' && direction !== 'input')) {
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_post',
        userRole,
        actor: actorName,
        decision: 'deny',
        reasonCode: 'INVALID_BODY',
        yearMonth: taxMonth,
        periodType: 'monthly',
        storeScope:
          body.storeName != null && String(body.storeName).trim() !== ''
            ? String(body.storeName).slice(0, 200)
            : null,
        filingType: 'vat_pp30',
        targetType: 'vat_ledger',
      })
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    const row = {
      doc_date: docDate,
      tax_month: taxMonth,
      direction,
      counterparty_name: body.counterpartyName != null ? String(body.counterpartyName).slice(0, 500) : null,
      counterparty_tax_id: body.counterpartyTaxId != null ? String(body.counterpartyTaxId).slice(0, 32) : null,
      invoice_number: body.invoiceNumber != null ? String(body.invoiceNumber).slice(0, 128) : null,
      net_amount: Number(body.netAmount ?? body.net_amount) || 0,
      vat_amount: Number(body.vatAmount ?? body.vat_amount) || 0,
      total_amount: Number(body.totalAmount ?? body.total_amount) || 0,
      vat_status: body.vatStatus != null ? String(body.vatStatus).slice(0, 64) : null,
      memo: body.memo != null ? String(body.memo).slice(0, 2000) : null,
      filing_status: filingStatus,
      submitted_at: filingStatus === 'submitted' ? submittedAtRaw || new Date().toISOString() : null,
      submitted_by: filingStatus === 'submitted' ? submittedByRaw || null : null,
      submitted_by_employee_id: filingStatus === 'submitted' ? actorEmployeeId : null,
      submitted_by_employee_code: filingStatus === 'submitted' ? actorEmployeeCode : null,
      store_name: effectiveStoreName ? String(effectiveStoreName).slice(0, 200) : null,
      updated_at: new Date().toISOString(),
    }

    if (id > 0) {
      const existingRows = (await supabaseSelectFilter('vat_ledger_entries', `id=eq.${id}`, {
        select: 'id,store_name',
        limit: 1,
      })) as { id?: number; store_name?: string | null }[] | null
      const existing = existingRows?.[0]
      if (!existing?.id) {
        return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404, headers })
      }
      const existingStoreName = String(existing.store_name || '').trim()
      if (!isOfficeLevel && existingStoreName) {
        const canAccessExisting = jwtAllowedStores.some((s) => storesMatchForGradeLookup(s, existingStoreName))
        if (!canAccessExisting) {
          return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      }
      try {
        await supabaseUpdate('vat_ledger_entries', id, { ...row })
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate('vat_ledger_entries', id, stripSubmissionAuditFields(row))
      }
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_post',
        userRole,
        actor: actorName,
        decision: 'allow',
        reasonCode: filingStatus === 'submitted' ? 'UPDATED_SUBMITTED' : 'UPDATED_DRAFT',
        yearMonth: taxMonth,
        periodType: 'monthly',
        storeScope: row.store_name,
        filingType: 'vat_pp30',
        targetType: 'vat_ledger',
        targetId: String(id),
      })
      return NextResponse.json({ success: true, id }, { headers })
    }

    const insertRow = {
      ...row,
      created_by: actorName,
      created_by_employee_id: actorEmployeeId,
      created_by_employee_code: actorEmployeeCode,
      created_at: new Date().toISOString(),
    }
    let inserted: { id?: number }[] = []
    try {
      inserted = (await supabaseInsert('vat_ledger_entries', insertRow)) as { id?: number }[]
    } catch (e) {
      if (!isMissingSubmissionColumnError(e)) throw e
      inserted = (await supabaseInsert('vat_ledger_entries', stripSubmissionAuditFields(insertRow))) as {
        id?: number
      }[]
    }
    const newId = Number(inserted?.[0]?.id || 0)
    await writeAccountingComplianceAudit({
      actionType: 'vat_ledger_post',
      userRole,
      actor: actorName,
      decision: 'allow',
      reasonCode: filingStatus === 'submitted' ? 'CREATED_SUBMITTED' : 'CREATED_DRAFT',
      yearMonth: taxMonth,
      periodType: 'monthly',
      storeScope: row.store_name,
      filingType: 'vat_pp30',
      targetType: 'vat_ledger',
      targetId: String(newId),
    })
    return NextResponse.json({ success: true, id: newId }, { headers })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'ACCOUNTING_FORBIDDEN' || e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN')
    ) {
      try {
        const body = await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'vat_ledger_post',
          userRole: jwtUserRole,
          actor: String(authResult.auth.name || body.createdBy || '').trim() || null,
          decision: 'deny',
          reasonCode: e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN' ? 'FORBIDDEN_APPROVE' : 'FORBIDDEN_WRITE',
          yearMonth: String(body.taxMonth || body.tax_month || '').trim().slice(0, 7),
          periodType: 'monthly',
          storeScope:
            body.storeName != null && String(body.storeName).trim() !== ''
              ? String(body.storeName).slice(0, 200)
              : null,
          filingType: 'vat_pp30',
          targetType: 'vat_ledger',
          targetId: body.id != null ? String(body.id) : null,
        })
      } catch {}
      return NextResponse.json(
        { success: false, error: e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN' ? 'FORBIDDEN_APPROVE' : 'FORBIDDEN' },
        { status: 403, headers }
      )
    }
    console.error('vatLedger POST:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const jwtUserRole = String(authResult.auth.role || '').trim()
  const jwtAllowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = jwtUserRole
    const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
    assertCanWriteAccountingCompliance(userRole)

    const id = Number(body.id || 0)
    if (!id) {
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_delete',
        userRole,
        actor: null,
        decision: 'deny',
        reasonCode: 'INVALID_ID',
        filingType: 'vat_pp30',
        targetType: 'vat_ledger',
      })
      return NextResponse.json({ success: false, error: 'INVALID_ID' }, { status: 400, headers })
    }

    const existingRows = (await supabaseSelectFilter('vat_ledger_entries', `id=eq.${id}`, {
      select: 'id,store_name',
      limit: 1,
    })) as { id?: number; store_name?: string | null }[] | null
    const existing = existingRows?.[0]
    if (!existing?.id) {
      return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404, headers })
    }
    const existingStoreName = String(existing.store_name || '').trim()
    if (!isOfficeLevel && existingStoreName) {
      const canAccessExisting = jwtAllowedStores.some((s) => storesMatchForGradeLookup(s, existingStoreName))
      if (!canAccessExisting) {
        return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }

    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${id}`)
    await writeAccountingComplianceAudit({
      actionType: 'vat_ledger_delete',
      userRole,
      actor: null,
      decision: 'allow',
      reasonCode: 'DELETED',
      filingType: 'vat_pp30',
      targetType: 'vat_ledger',
      targetId: String(id),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      try {
        const body = await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'vat_ledger_delete',
          userRole: jwtUserRole,
          actor: null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN_WRITE',
          filingType: 'vat_pp30',
          targetType: 'vat_ledger',
          targetId: body.id != null ? String(body.id) : null,
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN_WRITE' }, { status: 403, headers })
    }
    console.error('vatLedger DELETE:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
