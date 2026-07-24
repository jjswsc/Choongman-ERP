import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
  supabaseCountFilter,
} from '@/lib/supabase-server'
import {
  assertCanApproveAccountingCompliance,
  assertCanManageAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { isAccountingPeriodClosed } from '@/lib/accounting-period-server'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { syncIncrementalVatLedgersFromExpenseAndBank, syncTaxVatLedgersFromStockAndExpenses } from '@/lib/tax-ledger-auto-sync'
import {
  backfillVatLedgerStoreNames,
  enrichVatLedgerRowsStoreNames,
  syncPosOrdersOutputVatLedger,
} from '@/lib/pos-ledger-drafts'
import { isOfficeStoreVariant } from '@/lib/office-store-canonical'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole, isOfficeStore } from '@/lib/permissions'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  applyEvidenceToVatLedgerRow,
  enrichVatLedgerEntries,
  isInvoiceEvidencePending,
  isMissingEvidenceColumnError,
  normalizeInvoiceEvidenceStatus,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'

export const dynamic = 'force-dynamic'
// 최초 동기화(빈 기간·매입 없음)나 forceSync 시 다건 upsert에 시간이 걸릴 수 있어,
// 무거운 회계 리포트 라우트(getBalanceSheet 등)와 동일하게 여유를 둔다.
export const maxDuration = 120

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

type PendingEvidenceLite = {
  id: number
  docDate: string
  counterpartyName: string
  invoiceNumber: string
  storeName: string
  memo: string
}

async function listPendingEvidenceRows(taxMonth: string, storeScope?: string | null): Promise<PendingEvidenceLite[]> {
  const ym = String(taxMonth || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return []
  const hasEvidenceColumns = await probeVatLedgerEvidenceColumns()
  const parts = [`tax_month=eq.${encodeURIComponent(ym)}`]
  if (hasEvidenceColumns) {
    parts.push(`invoice_evidence_status=eq.${encodeURIComponent('required_pending')}`)
  }
  const store = String(storeScope || '').trim()
  if (store) parts.push(`store_name=eq.${encodeURIComponent(store)}`)
  const selectCols = hasEvidenceColumns
    ? 'id,doc_date,counterparty_name,invoice_number,store_name,memo,invoice_evidence_status,invoice_evidence_reason_code'
    : 'id,doc_date,counterparty_name,invoice_number,store_name,memo'
  let rows: {
    id?: number
    doc_date?: string | null
    counterparty_name?: string | null
    invoice_number?: string | null
    store_name?: string | null
    memo?: string | null
    invoice_evidence_status?: string | null
    invoice_evidence_reason_code?: string | null
  }[]
  try {
    rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', parts.join('&'), {
      select: selectCols,
      order: 'doc_date.asc,id.asc',
      pageSize: 500,
      maxRows: 5000,
    })) as typeof rows
  } catch (e) {
    if (isMissingEvidenceColumnError(e)) {
      rows = (await supabaseSelectFilterAllPages(
        'vat_ledger_entries',
        [`tax_month=eq.${encodeURIComponent(ym)}`, store ? `store_name=eq.${encodeURIComponent(store)}` : '']
          .filter(Boolean)
          .join('&'),
        {
          select: 'id,doc_date,counterparty_name,invoice_number,store_name,memo',
          order: 'doc_date.asc,id.asc',
          pageSize: 500,
          maxRows: 5000,
        }
      )) as typeof rows
    } else {
      throw e
    }
  }
  return (rows || [])
    .filter((r) => isInvoiceEvidencePending(r as Record<string, unknown>))
    .map((r) => ({
      id: Number(r.id || 0),
      docDate: String(r.doc_date || '').slice(0, 10),
      counterpartyName: String(r.counterparty_name || ''),
      invoiceNumber: String(r.invoice_number || ''),
      storeName: String(r.store_name || ''),
      memo: String(r.memo || ''),
    }))
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
  const forceSync = ['1', 'true', 'yes'].includes(
    String(searchParams.get('forceSync') || '').trim().toLowerCase()
  )
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(authResult.auth.store || '').trim()
  const isOfficeLevel =
    isOfficeRole(userRole) ||
    isAccountingRole(userRole) ||
    isOfficeStore(userStore) ||
    isHeadOfficeLikeStoreName(userStore)
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
    const syncStoreFilter = storeScope.requestedCanonical || storeFilter || 'All'
    const scopedStoreFilter = !!storeFilter && storeFilter !== 'All'
    const dbStoreNames = scopedStoreFilter ? storeScope.dbStoreNameValues || [] : []
    const storeNameDbFilter =
      dbStoreNames.length > 0
        ? `store_name=in.(${dbStoreNames.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`
        : ''
    const monthAndStoreFilter = [monthFilter, storeNameDbFilter].filter(Boolean).join('&')

    const runVatAutoSync = async (opts?: { skipPos?: boolean }) => {
      await syncTaxVatLedgersFromStockAndExpenses({
        months: period.months,
        storeFilter: syncStoreFilter,
        skipPos: !!opts?.skipPos,
      })
    }

    const runBackfill = async () => {
      await backfillVatLedgerStoreNames(period.months)
    }

    // 조회 성능: 매 검색마다 지출 건별 upsert·POS 전체 재동기화·원장 10만행 probe를 하지 않는다.
    // - 평소: DB에서 해당 월(·매장) 원장만 읽기
    // - forceSync=1 또는 해당 범위에 행이 0건일 때만 동기화
    let hasAnyRows = true
    try {
      const scopedCount = await supabaseCountFilter('vat_ledger_entries', monthAndStoreFilter)
      hasAnyRows = scopedCount > 0
    } catch (e) {
      console.warn('vatLedger GET probe count skipped:', e)
      hasAnyRows = true
    }
    const didSync = forceSync || !hasAnyRows
    let syncWarning: string | null = null
    let posSynced = 0

    if (didSync) {
      const officeForceSync =
        forceSync &&
        (isOfficeStoreVariant(storeFilter) ||
          isOfficeStoreVariant(syncStoreFilter) ||
          isHeadOfficeLikeStoreName(storeFilter) ||
          isHeadOfficeLikeStoreName(syncStoreFilter))

      // 가맹 forceSync: POS → 입고·지출 매입(POS 중복 생략). 본사: 입고·지출만.
      if (!officeForceSync) {
        try {
          const pos = await syncPosOrdersOutputVatLedger({
            months: period.months,
            storeFilter: syncStoreFilter,
          })
          posSynced = Number(pos.upserted || 0)
        } catch (e) {
          console.warn('vatLedger GET POS sync failed:', e)
          syncWarning = 'POS_SYNC_FAILED'
        }
      }

      if (forceSync || !hasAnyRows) {
        try {
          await runVatAutoSync({ skipPos: !officeForceSync && forceSync })
        } catch (e) {
          console.warn('vatLedger GET auto-sync skipped:', e)
          if (forceSync && !syncWarning) syncWarning = 'FULL_SYNC_PARTIAL'
        }
        // 증분 지출 루프는 타임아웃 유발 — full sync에 이미 지출 반영됨. 빈 원장 최초만 보조.
        if (!forceSync && !hasAnyRows) {
          try {
            await syncIncrementalVatLedgersFromExpenseAndBank({
              months: period.months,
              storeFilter: syncStoreFilter,
            })
          } catch (e) {
            console.warn('vatLedger GET incremental sync skipped:', e)
          }
        }
      }
      try {
        await runBackfill()
      } catch (e) {
        console.warn('vatLedger GET store_name backfill skipped:', e)
      }
    }

    // 동기화 실패와 무관하게 원장 조회는 항상 시도 (빈 화면·「불러오지 못했습니다」 방지)
    let entries: Record<string, unknown>[] = []
    try {
      const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthAndStoreFilter, {
        select: '*',
        order: 'doc_date.asc,id.asc',
        pageSize: 4000,
        maxRows: 100000,
      })) as Record<string, unknown>[] | null
      const enrichedRows = await enrichVatLedgerRowsStoreNames(rows || [])
      entries = enrichedRows.filter((row) => {
        if (!storeScope.matches(String(row.store_name || ''))) return false
        return matchesFilingStatus(row.filing_status, filingStatus)
      })
    } catch (loadErr) {
      console.error('vatLedger GET load rows:', loadErr)
      return NextResponse.json(
        {
          entries: [],
          error: 'QUERY_FAILED',
          syncWarning,
          synced: didSync,
          posSynced,
        },
        { headers }
      )
    }

    return NextResponse.json(
      {
        entries: enrichVatLedgerEntries(entries),
        period,
        synced: didSync,
        posSynced,
        syncWarning,
      },
      { headers }
    )
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
    const evidenceStatus = normalizeInvoiceEvidenceStatus(
      body.invoiceEvidenceStatus ?? body.invoice_evidence_status
    )
    const evidenceReason =
      body.invoiceEvidenceReasonCode != null || body.invoice_evidence_reason_code != null
        ? String((body.invoiceEvidenceReasonCode ?? body.invoice_evidence_reason_code) || '')
            .trim()
            .slice(0, 64) || null
        : null
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

    const periodStoreForCheck = effectiveStoreName || null
    if (await isAccountingPeriodClosed(taxMonth, periodStoreForCheck)) {
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_post',
        userRole,
        actor: actorName,
        decision: 'deny',
        reasonCode: 'PERIOD_CLOSED',
        yearMonth: taxMonth,
        periodType: 'monthly',
        storeScope: periodStoreForCheck,
        filingType: 'vat_pp30',
        targetType: 'vat_ledger',
      })
      return NextResponse.json({ success: false, error: 'PERIOD_CLOSED' }, { status: 409, headers })
    }
    if (filingStatus === 'submitted' && evidenceStatus === 'required_pending') {
      await writeAccountingComplianceAudit({
        actionType: 'vat_ledger_post',
        userRole,
        actor: actorName,
        decision: 'deny',
        reasonCode: 'EVIDENCE_REQUIRED_FOR_SUBMIT',
        yearMonth: taxMonth,
        periodType: 'monthly',
        storeScope: periodStoreForCheck,
        filingType: 'vat_pp30',
        targetType: 'vat_ledger',
      })
      return NextResponse.json({ success: false, error: 'EVIDENCE_REQUIRED_FOR_SUBMIT' }, { status: 409, headers })
    }

    const row = await applyEvidenceToVatLedgerRow(
      {
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
      },
      evidenceStatus,
      evidenceReason
    )

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
      const lockStore = effectiveStoreName || existingStoreName || null
      if (await isAccountingPeriodClosed(taxMonth, lockStore)) {
        return NextResponse.json({ success: false, error: 'PERIOD_CLOSED' }, { status: 409, headers })
      }
      if (filingStatus === 'submitted') {
        const pendingAll = await listPendingEvidenceRows(taxMonth, lockStore)
        const pendingRows = pendingAll.filter((x) => !(x.id === id && evidenceStatus !== 'required_pending'))
        if (pendingRows.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: 'EVIDENCE_PENDING_IN_MONTH',
              pendingEvidenceCount: pendingRows.length,
              pendingEvidenceRows: pendingRows.slice(0, 20),
            },
            { status: 409, headers }
          )
        }
      }
      try {
        await supabaseUpdate('vat_ledger_entries', id, { ...row })
      } catch (e) {
        const fallbackRow = await vatLedgerRowForSchemaError({ ...row }, e, {
          submissionStrip: stripSubmissionAuditFields,
        })
        if (!fallbackRow) throw e
        await supabaseUpdate('vat_ledger_entries', id, fallbackRow)
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
    if (filingStatus === 'submitted') {
      const pendingRows = await listPendingEvidenceRows(taxMonth, periodStoreForCheck)
      if (pendingRows.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'EVIDENCE_PENDING_IN_MONTH',
            pendingEvidenceCount: pendingRows.length,
            pendingEvidenceRows: pendingRows.slice(0, 20),
          },
          { status: 409, headers }
        )
      }
    }
    let inserted: { id?: number }[] = []
    try {
      inserted = (await supabaseInsert('vat_ledger_entries', insertRow)) as { id?: number }[]
    } catch (e) {
      const fallbackRow = await vatLedgerRowForSchemaError({ ...insertRow }, e, {
        submissionStrip: stripSubmissionAuditFields,
      })
      if (!fallbackRow) throw e
      inserted = (await supabaseInsert('vat_ledger_entries', fallbackRow)) as { id?: number }[]
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
      select: 'id,store_name,tax_month',
      limit: 1,
    })) as { id?: number; store_name?: string | null; tax_month?: string | null }[] | null
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
    const taxMonthDel = String(existing.tax_month || '').trim().slice(0, 7)
    if (taxMonthDel && (await isAccountingPeriodClosed(taxMonthDel, existingStoreName || null))) {
      return NextResponse.json({ success: false, error: 'PERIOD_CLOSED' }, { status: 409, headers })
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
