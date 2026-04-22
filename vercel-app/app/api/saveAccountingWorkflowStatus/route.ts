import { NextRequest, NextResponse } from 'next/server'
import {
  assertCanApproveAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { workflowStoreScopeFromStoreTb } from '@/lib/accounting-ledger-store-filter'
import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { writeAccountingWorkflowEvent } from '@/lib/accounting-workflow-events'
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

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const jwtUserRole = String(auth.role || '').trim()
  const jwtAllowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(auth.store || '').trim())
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = jwtUserRole
    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const periodType = parsePeriodType(body.periodType)
    const filingType = String(body.filingType || '').trim()
    const statusRaw = String(body.status || '').trim().toLowerCase()
    const status = ['todo', 'in_progress', 'review', 'done'].includes(statusRaw) ? statusRaw : 'todo'
    const note = body.note != null ? String(body.note).slice(0, 2000) : null
    const owner = body.owner != null ? String(body.owner).slice(0, 200) : null
    const updatedBy = body.updatedBy != null ? String(body.updatedBy).slice(0, 200) : null
    const requestedStoreFilter = body.storeFilter != null ? String(body.storeFilter).trim() : ''
    const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
    let effectiveStoreFilter = requestedStoreFilter
    if (!isOfficeLevel) {
      if (!requestedStoreFilter || requestedStoreFilter === 'All') {
        effectiveStoreFilter = String(jwtAllowedStores[0] || '').trim()
        if (!effectiveStoreFilter) {
          return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      } else {
        const allowed = jwtAllowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
        if (!allowed) {
          return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      }
    }
    const storeScope = workflowStoreScopeFromStoreTb(effectiveStoreFilter || 'All')

    if (!/^\d{4}-\d{2}$/.test(yearMonth) || !filingType) {
      await writeAccountingComplianceAudit({
        actionType: 'workflow_status_save',
        userRole,
        actor: updatedBy,
        decision: 'deny',
        reasonCode: 'INVALID_BODY',
        yearMonth,
        periodType,
        filingType,
        targetType: 'workflow',
      })
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })

    if (status === 'done' || status === 'review') assertCanApproveAccountingCompliance(userRole)
    else assertCanWriteAccountingCompliance(userRole)

    const row = {
      year_month: yearMonth,
      period_type: periodType,
      period_key: period.periodKey,
      filing_type: filingType,
      store_scope: storeScope,
      status,
      note,
      owner,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }
    let fallbackUsed = false
    try {
      const exists = (await supabaseSelectFilter(
        'accounting_filing_workflow_status',
        [
          `period_type=eq.${encodeURIComponent(periodType)}`,
          `period_key=eq.${encodeURIComponent(period.periodKey)}`,
          `filing_type=eq.${encodeURIComponent(filingType)}`,
          `store_scope=eq.${encodeURIComponent(storeScope)}`,
        ].join('&'),
        { select: 'id', limit: 1 }
      )) as { id?: number }[] | null
      if (exists?.[0]?.id) {
        await supabaseUpdate('accounting_filing_workflow_status', Number(exists[0].id), row)
        await writeAccountingWorkflowEvent({
          yearMonth,
          periodType,
          periodKey: period.periodKey,
          storeScope,
          filingType,
          status,
          actor: updatedBy,
          sourceWorkflowStatusId: Number(exists[0].id),
          note,
          fallbackUsed,
        })
        await writeAccountingComplianceAudit({
          actionType: 'workflow_status_save',
          userRole,
          actor: updatedBy,
          decision: 'allow',
          reasonCode: 'UPDATED',
          yearMonth,
          periodType,
          periodKey: period.periodKey,
          storeScope,
          filingType,
          targetType: 'workflow',
          targetId: String(exists[0].id),
          payload: { status, fallbackUsed },
        })
        return NextResponse.json({ success: true, id: Number(exists[0].id), fallbackUsed }, { headers })
      }
      const inserted = (await supabaseInsert('accounting_filing_workflow_status', row)) as { id?: number }[] | null
      await writeAccountingWorkflowEvent({
        yearMonth,
        periodType,
        periodKey: period.periodKey,
        storeScope,
        filingType,
        status,
        actor: updatedBy,
        sourceWorkflowStatusId: Number(inserted?.[0]?.id || 0) || null,
        note,
        fallbackUsed,
      })
      await writeAccountingComplianceAudit({
        actionType: 'workflow_status_save',
        userRole,
        actor: updatedBy,
        decision: 'allow',
        reasonCode: 'CREATED',
        yearMonth,
        periodType,
        periodKey: period.periodKey,
        storeScope,
        filingType,
        targetType: 'workflow',
        targetId: String(inserted?.[0]?.id || ''),
        payload: { status, fallbackUsed },
      })
      return NextResponse.json({ success: true, id: Number(inserted?.[0]?.id || 0), fallbackUsed }, { headers })
    } catch (e) {
      if (!isMissingWorkflowPeriodColumnsError(e)) throw e
      fallbackUsed = true
      console.warn('saveAccountingWorkflowStatus fallback: missing period columns')
      const fallbackRow = {
        year_month: yearMonth,
        filing_type: filingType,
        store_scope: storeScope,
        status,
        note,
        owner,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      }
      const existsOld = (await supabaseSelectFilter(
        'accounting_filing_workflow_status',
        `year_month=eq.${encodeURIComponent(yearMonth)}&filing_type=eq.${encodeURIComponent(filingType)}&store_scope=eq.${encodeURIComponent(storeScope)}`,
        { select: 'id', limit: 1 }
      )) as { id?: number }[] | null
      if (existsOld?.[0]?.id) {
        await supabaseUpdate('accounting_filing_workflow_status', Number(existsOld[0].id), fallbackRow)
        await writeAccountingWorkflowEvent({
          yearMonth,
          periodType,
          periodKey: period.periodKey,
          storeScope,
          filingType,
          status,
          actor: updatedBy,
          sourceWorkflowStatusId: Number(existsOld[0].id),
          note,
          fallbackUsed,
        })
        await writeAccountingComplianceAudit({
          actionType: 'workflow_status_save',
          userRole,
          actor: updatedBy,
          decision: 'allow',
          reasonCode: 'UPDATED_FALLBACK',
          yearMonth,
          periodType,
          periodKey: period.periodKey,
          storeScope,
          filingType,
          targetType: 'workflow',
          targetId: String(existsOld[0].id),
          payload: { status, fallbackUsed },
        })
        return NextResponse.json({ success: true, id: Number(existsOld[0].id), fallbackUsed }, { headers })
      }
      const insertedOld = (await supabaseInsert('accounting_filing_workflow_status', fallbackRow)) as
        | { id?: number }[]
        | null
      await writeAccountingWorkflowEvent({
        yearMonth,
        periodType,
        periodKey: period.periodKey,
        storeScope,
        filingType,
        status,
        actor: updatedBy,
        sourceWorkflowStatusId: Number(insertedOld?.[0]?.id || 0) || null,
        note,
        fallbackUsed,
      })
      await writeAccountingComplianceAudit({
        actionType: 'workflow_status_save',
        userRole,
        actor: updatedBy,
        decision: 'allow',
        reasonCode: 'CREATED_FALLBACK',
        yearMonth,
        periodType,
        periodKey: period.periodKey,
        storeScope,
        filingType,
        targetType: 'workflow',
        targetId: String(insertedOld?.[0]?.id || ''),
        payload: { status, fallbackUsed },
      })
      return NextResponse.json({ success: true, id: Number(insertedOld?.[0]?.id || 0), fallbackUsed }, { headers })
    }
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'ACCOUNTING_FORBIDDEN' ||
        e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN')
    ) {
      try {
        const body = await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'workflow_status_save',
          userRole: jwtUserRole,
          actor: body.updatedBy != null ? String(body.updatedBy).trim() : null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN',
          yearMonth: String(body.yearMonth || '').trim(),
          periodType: parsePeriodType(body.periodType),
          filingType: String(body.filingType || '').trim() || null,
          targetType: 'workflow',
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('saveAccountingWorkflowStatus:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

