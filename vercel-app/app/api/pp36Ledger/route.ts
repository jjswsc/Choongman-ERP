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
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
    const rows = (await supabaseSelectFilterAllPages('vat_pp36_ledger_entries', monthFilter, {
      select: '*',
      pageSize: 4000,
      maxRows: 100000,
      order: 'doc_date.asc,id.asc',
    })) as Record<string, unknown>[] | null
    const entries = (rows || []).filter((row) => {
      if (!storeScope.matches(String(row.store_name || ''))) return false
      return matchesFilingStatus(row.filing_status, filingStatus)
    })
    return NextResponse.json({ entries, period }, { headers })
  } catch (e) {
    console.error('pp36Ledger GET:', e)
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
    const docDate = String(body.docDate || body.doc_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    const filingStatus = normalizeLedgerFilingStatus(body.filingStatus ?? body.filing_status)
    if (filingStatus === 'submitted') assertCanApproveAccountingCompliance(userRole)
    else assertCanWriteAccountingCompliance(userRole)
    const submittedAtRaw = String((body.submittedAt ?? body.submitted_at ?? '') || '').trim()
    const submittedByRaw = String((body.submittedBy ?? body.submitted_by ?? body.createdBy ?? '') || '').trim()
    if (!docDate || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    const canonicalStoreName = effectiveStoreName ? await canonicalLedgerStoreName(effectiveStoreName) : null
    const row = {
      doc_date: docDate,
      tax_month: taxMonth,
      supplier_name: body.supplierName != null ? String(body.supplierName).slice(0, 500) : null,
      supplier_country: body.supplierCountry != null ? String(body.supplierCountry).slice(0, 80) : null,
      supplier_tax_id: body.supplierTaxId != null ? String(body.supplierTaxId).slice(0, 32) : null,
      service_desc: body.serviceDesc != null ? String(body.serviceDesc).slice(0, 500) : null,
      taxable_amount: Number(body.taxableAmount ?? body.taxable_amount) || 0,
      vat_rate: body.vatRate != null ? Number(body.vatRate) : 7,
      vat_amount: Number(body.vatAmount ?? body.vat_amount) || 0,
      treaty_relief_note: body.treatyReliefNote != null ? String(body.treatyReliefNote).slice(0, 1000) : null,
      memo: body.memo != null ? String(body.memo).slice(0, 2000) : null,
      filing_status: filingStatus,
      submitted_at: filingStatus === 'submitted' ? submittedAtRaw || new Date().toISOString() : null,
      submitted_by: filingStatus === 'submitted' ? submittedByRaw || null : null,
      store_name: canonicalStoreName ? String(canonicalStoreName).slice(0, 200) : null,
      updated_at: new Date().toISOString(),
    }

    if (id > 0) {
      const existingRows = (await supabaseSelectFilter('vat_pp36_ledger_entries', `id=eq.${id}`, {
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
        await supabaseUpdate('vat_pp36_ledger_entries', id, row)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate('vat_pp36_ledger_entries', id, stripSubmissionAuditFields(row))
      }
      return NextResponse.json({ success: true, id }, { headers })
    }

    const insertRow = {
      ...row,
      created_by: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
      created_at: new Date().toISOString(),
    }
    let inserted: { id?: number }[] = []
    try {
      inserted = (await supabaseInsert('vat_pp36_ledger_entries', insertRow)) as { id?: number }[]
    } catch (e) {
      if (!isMissingSubmissionColumnError(e)) throw e
      inserted = (await supabaseInsert(
        'vat_pp36_ledger_entries',
        stripSubmissionAuditFields(insertRow)
      )) as { id?: number }[]
    }
    const newId = Number(inserted?.[0]?.id || 0)
    return NextResponse.json({ success: true, id: newId }, { headers })
  } catch (e) {
    console.error('pp36Ledger POST:', e)
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
    assertCanManageAccountingCompliance(userRole)
    assertCanWriteAccountingCompliance(userRole)
    const id = Number(body.id || 0)
    if (!id) return NextResponse.json({ success: false, error: 'INVALID_ID' }, { status: 400, headers })
    const existingRows = (await supabaseSelectFilter('vat_pp36_ledger_entries', `id=eq.${id}`, {
      select: 'id,store_name',
      limit: 1,
    })) as { id?: number; store_name?: string | null }[] | null
    const existing = existingRows?.[0]
    if (!existing?.id) return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404, headers })
    const existingStoreName = String(existing.store_name || '').trim()
    if (!isOfficeLevel && existingStoreName) {
      const canAccessExisting = jwtAllowedStores.some((s) => storesMatchForGradeLookup(s, existingStoreName))
      if (!canAccessExisting) {
        return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
    await supabaseDeleteByFilter('vat_pp36_ledger_entries', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('pp36Ledger DELETE:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
