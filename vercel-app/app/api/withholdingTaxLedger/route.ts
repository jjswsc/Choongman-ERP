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
import { canonicalLedgerStoreName } from '@/lib/erp-store-identity'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import {
  syncTaxWithholdingLedgersFromBankDeposits,
  syncTaxWithholdingLedgersFromBankWithdrawals,
  syncTaxWithholdingLedgersFromExpenses,
  syncTaxWithholdingLedgersFromPayroll,
  syncTaxWithholdingLedgersFromPurchaseOrders,
} from '@/lib/tax-ledger-auto-sync'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { withManualWhtAmountsTag, preserveAutoWhtMemoTags } from '@/lib/withholding-tax-ledger-core'

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
      await syncTaxWithholdingLedgersFromExpenses({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromPayroll({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromPurchaseOrders({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromBankDeposits({
        months: period.months,
        storeFilter,
      })
      await syncTaxWithholdingLedgersFromBankWithdrawals({
        months: period.months,
        storeFilter,
      })
    } catch (e) {
      console.warn('withholdingTaxLedger GET auto-sync skipped:', e)
    }
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const rows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', monthFilter, {
      select: '*',
      pageSize: 4000,
      maxRows: 100000,
      order: 'payment_date.asc,id.asc',
    })) as Record<string, unknown>[] | null
    const entries = (rows || []).filter((row) => {
      if (!storeScope.matches(String(row.store_name || ''))) return false
      return matchesFilingStatus(row.filing_status, filingStatus)
    })
    return NextResponse.json({ entries, period }, { headers })
  } catch (e) {
    console.error('withholdingTaxLedger GET:', e)
    return NextResponse.json({ entries: [] }, { headers })
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
    const paymentDate = String(body.paymentDate || body.payment_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    const filingStatus = normalizeLedgerFilingStatus(body.filingStatus ?? body.filing_status)
    if (filingStatus === 'submitted') assertCanApproveAccountingCompliance(userRole)
    else assertCanWriteAccountingCompliance(userRole)
    const submittedAtRaw = String((body.submittedAt ?? body.submitted_at ?? '') || '').trim()
    const submittedByRaw = String((body.submittedBy ?? body.submitted_by ?? body.createdBy ?? '') || '').trim()
    if (!paymentDate || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      await writeAccountingComplianceAudit({
        actionType: 'withholding_tax_ledger_post',
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
        filingType: 'wht_pnd',
        targetType: 'withholding_tax_ledger',
      })
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    const directionRaw = String(body.direction || '').trim().toLowerCase()
    const sourceTypeRaw = String(body.sourceType ?? body.source_type ?? '').trim()
    const sourceIdRaw = body.sourceId ?? body.source_id
    const sourceId =
      sourceIdRaw != null && sourceIdRaw !== '' && !isNaN(Number(sourceIdRaw))
        ? Math.floor(Number(sourceIdRaw))
        : 0

    const canonicalStoreName = effectiveStoreName ? await canonicalLedgerStoreName(effectiveStoreName) : null
    const row: Record<string, unknown> = {
      payment_date: paymentDate,
      tax_month: taxMonth,
      payee_name: body.payeeName != null ? String(body.payeeName).slice(0, 500) : null,
      payee_tax_id: body.payeeTaxId != null ? String(body.payeeTaxId).slice(0, 32) : null,
      income_type: body.incomeType != null ? String(body.incomeType).slice(0, 128) : null,
      gross_amount: body.grossAmount != null ? Number(body.grossAmount) : null,
      wht_rate: body.whtRate != null ? Number(body.whtRate) : null,
      wht_amount: Number(body.whtAmount ?? body.wht_amount) || 0,
      form_hint: body.formHint != null ? String(body.formHint).slice(0, 64) : null,
      certificate_no: body.certificateNo != null ? String(body.certificateNo).slice(0, 128) : null,
      memo: withManualWhtAmountsTag(body.memo != null ? String(body.memo) : ''),
      filing_status: filingStatus,
      submitted_at: filingStatus === 'submitted' ? submittedAtRaw || new Date().toISOString() : null,
      submitted_by: filingStatus === 'submitted' ? submittedByRaw || null : null,
      store_name: canonicalStoreName ? String(canonicalStoreName).slice(0, 200) : null,
      updated_at: new Date().toISOString(),
    }
    if (directionRaw === 'inbound' || directionRaw === 'outbound') {
      row.direction = directionRaw
    }
    if (sourceTypeRaw) {
      row.source_type = sourceTypeRaw.slice(0, 64)
      row.source_id = sourceId > 0 ? sourceId : null
    } else if (id <= 0) {
      row.direction = directionRaw === 'inbound' ? 'inbound' : row.direction || 'outbound'
      row.source_type = 'manual'
    }

    if (id > 0) {
      const existingRows = (await supabaseSelectFilter('withholding_tax_ledger_entries', `id=eq.${id}`, {
        select: 'id,store_name,memo',
        limit: 1,
      })) as { id?: number; store_name?: string | null; memo?: string | null }[] | null
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
      row.memo = preserveAutoWhtMemoTags(existing.memo, String(row.memo || ''))
      try {
        await supabaseUpdate('withholding_tax_ledger_entries', id, row)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate('withholding_tax_ledger_entries', id, stripSubmissionAuditFields(row))
      }
      await writeAccountingComplianceAudit({
        actionType: 'withholding_tax_ledger_post',
        userRole,
        actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
        decision: 'allow',
        reasonCode: filingStatus === 'submitted' ? 'UPDATED_SUBMITTED' : 'UPDATED_DRAFT',
        yearMonth: taxMonth,
        periodType: 'monthly',
        storeScope:
          row.store_name != null ? String(row.store_name).slice(0, 200) : null,
        filingType: 'wht_pnd',
        targetType: 'withholding_tax_ledger',
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
      inserted = (await supabaseInsert('withholding_tax_ledger_entries', insertRow)) as { id?: number }[]
    } catch (e) {
      if (!isMissingSubmissionColumnError(e)) throw e
      inserted = (await supabaseInsert(
        'withholding_tax_ledger_entries',
        stripSubmissionAuditFields(insertRow)
      )) as { id?: number }[]
    }
    const newId = Number(inserted?.[0]?.id || 0)
    await writeAccountingComplianceAudit({
      actionType: 'withholding_tax_ledger_post',
      userRole,
      actor: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
      decision: 'allow',
      reasonCode: filingStatus === 'submitted' ? 'CREATED_SUBMITTED' : 'CREATED_DRAFT',
      yearMonth: taxMonth,
      periodType: 'monthly',
      storeScope:
        row.store_name != null ? String(row.store_name).slice(0, 200) : null,
      filingType: 'wht_pnd',
      targetType: 'withholding_tax_ledger',
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
          actionType: 'withholding_tax_ledger_post',
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
          filingType: 'wht_pnd',
          targetType: 'withholding_tax_ledger',
          targetId: body.id != null ? String(body.id) : null,
        })
      } catch {}
      return NextResponse.json(
        { success: false, error: e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN' ? 'FORBIDDEN_APPROVE' : 'FORBIDDEN' },
        { status: 403, headers }
      )
    }
    console.error('withholdingTaxLedger POST:', e)
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
        actionType: 'withholding_tax_ledger_delete',
        userRole,
        actor: null,
        decision: 'deny',
        reasonCode: 'INVALID_ID',
        filingType: 'wht_pnd',
        targetType: 'withholding_tax_ledger',
      })
      return NextResponse.json({ success: false, error: 'INVALID_ID' }, { status: 400, headers })
    }

    const existingRows = (await supabaseSelectFilter('withholding_tax_ledger_entries', `id=eq.${id}`, {
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

    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${id}`)
    await writeAccountingComplianceAudit({
      actionType: 'withholding_tax_ledger_delete',
      userRole,
      actor: null,
      decision: 'allow',
      reasonCode: 'DELETED',
      filingType: 'wht_pnd',
      targetType: 'withholding_tax_ledger',
      targetId: String(id),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      try {
        const body = await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'withholding_tax_ledger_delete',
          userRole: jwtUserRole,
          actor: null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN_WRITE',
          filingType: 'wht_pnd',
          targetType: 'withholding_tax_ledger',
          targetId: body.id != null ? String(body.id) : null,
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN_WRITE' }, { status: 403, headers })
    }
    console.error('withholdingTaxLedger DELETE:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
