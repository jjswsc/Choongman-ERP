import { NextRequest, NextResponse } from 'next/server'
import { normalizeAccountingPeriodStoreScope } from '@/lib/accounting-period-store-scope'
import { upsertAccountingPeriodRecord } from '@/lib/accounting-period-server'
import { supabaseInsert } from '@/lib/supabase-server'
import {
  assertCanApproveAccountingCompliance,
  assertCanApproveAccountingPeriodUnlock,
} from '@/lib/accounting-auth'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { requireAuth } from '@/lib/verify-auth'

function isMissingClosingRunTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('income_expense_closing_runs') || msg.includes('42p01')
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const jwtUserRole = String(authResult.auth.role || '').trim()
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = jwtUserRole
    assertCanApproveAccountingCompliance(userRole)

    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const storeScope = await normalizeAccountingPeriodStoreScope(
      String(body.storeScope || body.storeFilter || 'All').trim()
    )
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      await writeAccountingComplianceAudit({
        actionType: 'accounting_period_toggle',
        userRole,
        actor: null,
        decision: 'deny',
        reasonCode: 'INVALID_YEAR_MONTH',
        yearMonth,
        targetType: 'accounting_period',
      })
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }

    const closed = Boolean(body.closed)
    const closedBy = String(body.closedBy || '').trim().slice(0, 200) || null
    const unlockReason = String(body.unlockReason || '').trim().slice(0, 2000) || null
    const unlockApprovedBy = String(body.unlockApprovedBy || '').trim().slice(0, 200) || null
    const nowIso = new Date().toISOString()

    if (!closed) {
      assertCanApproveAccountingPeriodUnlock(userRole)
      if (!unlockReason || unlockReason.length < 5 || !unlockApprovedBy) {
        await writeAccountingComplianceAudit({
          actionType: 'accounting_period_toggle',
          userRole,
          actor: closedBy,
          decision: 'deny',
          reasonCode: 'UNLOCK_APPROVAL_REQUIRED',
          yearMonth,
          targetType: 'accounting_period',
        })
        return NextResponse.json(
          { success: false, error: 'UNLOCK_APPROVAL_REQUIRED' },
          { status: 400, headers }
        )
      }
    }

    await upsertAccountingPeriodRecord({
      year_month: yearMonth,
      store_scope: storeScope,
      is_closed: closed,
      closed_at: closed ? nowIso : null,
      closed_by: closed ? closedBy : null,
      unlocked_at: closed ? null : nowIso,
      unlocked_by: closed ? null : closedBy,
      unlock_reason: closed ? null : unlockReason,
      unlock_approved_by: closed ? null : unlockApprovedBy,
    })

    if (!closed) {
      try {
        const payload = {
          event: 'unlock',
          yearMonth,
          reason: unlockReason,
          approvedBy: unlockApprovedBy,
          requestedBy: closedBy,
          requestedAt: nowIso,
        }
        await supabaseInsert('income_expense_closing_runs', {
          year_month: yearMonth,
          store_scope: storeScope,
          status: 'unlock_request',
          profit_loss_account_code: '3120',
          revenue_total: 0,
          expense_total: 0,
          net_income: 0,
          line_count: 0,
          payload,
          journal_entry_id: null,
          memo: `unlock requested: ${unlockReason}`,
          created_by: closedBy,
          created_at: nowIso,
        })
        await supabaseInsert('income_expense_closing_runs', {
          year_month: yearMonth,
          store_scope: 'All',
          status: 'unlock_approved',
          profit_loss_account_code: '3120',
          revenue_total: 0,
          expense_total: 0,
          net_income: 0,
          line_count: 0,
          payload,
          journal_entry_id: null,
          memo: `unlock approved by: ${unlockApprovedBy}`,
          created_by: unlockApprovedBy,
          created_at: new Date().toISOString(),
        })
      } catch (e) {
        if (!isMissingClosingRunTableError(e)) throw e
      }
    } else {
      try {
        await supabaseInsert('income_expense_closing_runs', {
          year_month: yearMonth,
          store_scope: storeScope,
          status: 'period_locked',
          profit_loss_account_code: '3120',
          revenue_total: 0,
          expense_total: 0,
          net_income: 0,
          line_count: 0,
          payload: { event: 'lock', yearMonth, lockedBy: closedBy, lockedAt: nowIso, source: 'manual_period_tab' },
          journal_entry_id: null,
          memo: 'period locked manually',
          created_by: closedBy,
          created_at: nowIso,
        })
      } catch (e) {
        if (!isMissingClosingRunTableError(e)) throw e
      }
    }

    await writeAccountingComplianceAudit({
      actionType: 'accounting_period_toggle',
      userRole,
      actor: closedBy,
      decision: 'allow',
      reasonCode: closed ? 'PERIOD_LOCKED' : 'PERIOD_UNLOCKED',
      yearMonth,
      targetType: 'accounting_period',
      targetId: `${yearMonth}|${storeScope}`,
      storeScope,
      payload: closed
        ? { closedBy, storeScope }
        : { unlockReason, unlockApprovedBy, requestedBy: closedBy, storeScope },
    })

    return NextResponse.json({ success: true, yearMonth, storeScope, closed }, { headers })
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'ACCOUNTING_FORBIDDEN' ||
        e.message === 'ACCOUNTING_APPROVAL_FORBIDDEN' ||
        e.message === 'ACCOUNTING_UNLOCK_APPROVAL_FORBIDDEN')
    ) {
      try {
        const body = await request.json().catch(() => ({}))
        await writeAccountingComplianceAudit({
          actionType: 'accounting_period_toggle',
          userRole: jwtUserRole,
          actor: String(body.closedBy || '').trim() || null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN',
          yearMonth: String(body.yearMonth || '').trim(),
          targetType: 'accounting_period',
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('setAccountingPeriodClosed:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
