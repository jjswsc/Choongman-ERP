import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import {
  assertCanApproveAccountingCompliance,
  assertCanManageAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { syncTaxVatLedgersFromStockAndExpenses } from '@/lib/tax-ledger-auto-sync'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

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
  return msg.includes('filing_status') || msg.includes('submitted_at') || msg.includes('submitted_by')
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
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
  const allowedStores =
    (Array.isArray(authResult.auth.allowedStores) ? authResult.auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(authResult.auth.store || '').trim())
  try {
    assertCanManageAccountingCompliance(userRole)
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
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    try {
      await syncTaxVatLedgersFromStockAndExpenses({
        months: period.months,
        storeFilter,
      })
    } catch (e) {
      console.warn('vatLedger GET auto-sync skipped:', e)
    }
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const filter = appendStoreNameFilter(monthFilter, storeFilter)
    const rows = (await supabaseSelectFilter('vat_ledger_entries', filter, {
      select: '*',
      limit: 20000,
      order: 'doc_date.asc,id.asc',
    })) as Record<string, unknown>[] | null
    const entries = (rows || []).filter((row) => matchesFilingStatus(row.filing_status, filingStatus))
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
    const userRole = jwtUserRole
    const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
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
    assertCanManageAccountingCompliance(userRole)

    const id = body.id != null ? Number(body.id) : 0
    const docDate = String(body.docDate || body.doc_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    const direction = String(body.direction || '').toLowerCase()
    const filingStatus = normalizeLedgerFilingStatus(body.filingStatus ?? body.filing_status)
    if (filingStatus === 'submitted') assertCanApproveAccountingCompliance(userRole)
    else assertCanWriteAccountingCompliance(userRole)
    const submittedAtRaw = String((body.submittedAt ?? body.submitted_at ?? '') || '').trim()
    const submittedByRaw = String((body.submittedBy ?? body.submitted_by ?? body.createdBy ?? '') || '').trim()
    if (!docDate || !/^\d{4}-\d{2}$/.test(taxMonth) || (direction !== 'output' && direction !== 'input')) {
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_post',
        userRole,
        actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
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
        actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
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
      created_by: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
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
      actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
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
          actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
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
