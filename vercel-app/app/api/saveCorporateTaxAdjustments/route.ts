import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance, assertCanWriteAccountingCompliance } from '@/lib/accounting-auth'
import { requireAuth } from '@/lib/verify-auth'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'

type AdjustmentInput = {
  id?: number
  adjustmentType?: string
  adjustment_type?: string
  itemCode?: string | null
  item_code?: string | null
  itemName?: string
  item_name?: string
  amount?: number | string
  memo?: string | null
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
  const userRole = String(auth.role || '').trim()
  const actor = String(auth.name || auth.employeeCode || auth.employeeId || '').trim() || null

  try {
    assertCanManageAccountingCompliance(userRole)
    assertCanWriteAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const body = await request.json().catch(() => ({}))
    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const periodTypeRaw = String(body.periodType || 'monthly').trim().toLowerCase()
    const periodType = periodTypeRaw === 'half_year' || periodTypeRaw === 'annual' ? periodTypeRaw : 'monthly'
    const adjustments = (Array.isArray(body.adjustments) ? body.adjustments : []) as AdjustmentInput[]
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    await supabaseDeleteByFilter(
      'corporate_tax_adjustments',
      `period_type=eq.${encodeURIComponent(periodType)}&period_key=eq.${encodeURIComponent(period.periodKey)}`
    )
    const insertRows = adjustments
      .map((x) => {
        const adjustmentTypeRaw = String(x.adjustmentType ?? x.adjustment_type ?? 'add_back').trim().toLowerCase()
        const adjustmentType = adjustmentTypeRaw === 'deduction' ? 'deduction' : 'add_back'
        const itemName = String(x.itemName ?? x.item_name ?? '').trim()
        if (!itemName) return null
        const amount = Math.abs(Number(x.amount) || 0)
        return {
          period_key: period.periodKey,
          period_type: periodType,
          adjustment_type: adjustmentType,
          item_code: x.itemCode ?? x.item_code ?? null,
          item_name: itemName.slice(0, 200),
          amount,
          memo: x.memo != null ? String(x.memo).slice(0, 2000) : null,
          created_by: actor,
          updated_at: new Date().toISOString(),
        }
      })
      .filter(Boolean) as Record<string, unknown>[]
    for (const row of insertRows) {
      await supabaseInsert('corporate_tax_adjustments', row)
    }

    const rows = (await supabaseSelectFilter(
      'corporate_tax_adjustments',
      `period_type=eq.${encodeURIComponent(periodType)}&period_key=eq.${encodeURIComponent(period.periodKey)}`,
      { select: '*', order: 'id.asc', limit: 10000 }
    )) as Record<string, unknown>[] | null

    await writeAccountingComplianceAudit({
      actionType: 'corporate_tax_adjustments_save',
      userRole,
      actor,
      decision: 'allow',
      reasonCode: 'UPSERTED',
      yearMonth,
      periodType,
      periodKey: period.periodKey,
      filingType: 'cit_ppnd50',
      targetType: 'corporate_tax_adjustments',
      payload: { savedCount: insertRows.length },
    })

    return NextResponse.json(
      { success: true, periodKey: period.periodKey, savedCount: insertRows.length, rows: rows || [] },
      { headers }
    )
  } catch (e) {
    console.error('saveCorporateTaxAdjustments:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
