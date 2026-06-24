import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { syncCardAllocationInputVatLedgers } from '@/lib/card-input-vat-ledger'
import { syncTaxVatLedgersFromStockAndExpenses } from '@/lib/tax-ledger-auto-sync'
import { getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { requireAuth } from '@/lib/verify-auth'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'

/**
 * 기존 지출 발생(expense_accruals) 중 부가세가 있는 건을 매입 부가세 장부에 일괄 반영 (백필).
 * 신규 건은 등록/수정/승인 시 자동 동기화됨.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json().catch(() => ({}))
    const userRole = String(auth.role || '').trim()
    assertCanManageAccountingCompliance(userRole)
    const yearMonth = String(body.yearMonth || '').trim().slice(0, 7)
    const storeFilter = String(body.storeFilter || '').trim()
    const ymOk = /^\d{4}-\d{2}$/.test(yearMonth)
    const period = ymOk ? getThaiTaxFilingPeriodRange({ yearMonth, periodType: 'monthly' }) : null

    if (ymOk && storeFilter && storeFilter !== 'All') {
      try {
        await syncTaxVatLedgersFromStockAndExpenses({
          months: period!.months,
          storeFilter,
        })
      } catch (e) {
        console.warn('syncExpenseInputVatLedgers stock sync:', e)
      }
    }

    const rows = (await supabaseSelectFilterAllPages('expense_accruals', 'vat_amount=gt.0', {
      select: 'id,status,expense_date,store_name',
      order: 'id.asc',
      pageSize: 2000,
      maxRows: 30000,
    })) as { id?: number; status?: string; expense_date?: string; store_name?: string | null }[] | null

    const storeScope =
      storeFilter && storeFilter !== 'All' ? await createAccountingStoreScopeMatcher(storeFilter) : null
    const officeScope = !!storeFilter && isHeadOfficeLikeStoreName(storeFilter)

    let ok = 0
    let fail = 0
    let skipped = 0
    for (const r of rows || []) {
      const id = Math.floor(Number(r?.id) || 0)
      if (id <= 0) continue
      if (ymOk) {
        const ed = String(r?.expense_date || '').slice(0, 7)
        if (!period!.months.includes(ed)) continue
      }
      const st = String(r?.status || '').toLowerCase()
      if (st === 'rejected') continue
      const rowStore = String(r?.store_name || '').trim()
      if (storeScope) {
        const inScope = storeScope.matches(rowStore) || (officeScope && !rowStore)
        if (!inScope) {
          skipped += 1
          continue
        }
      }
      try {
        await syncExpenseAccrualInputVatLedger(
          id,
          officeScope && !rowStore ? { fallbackStoreName: storeFilter } : undefined
        )
        ok += 1
      } catch {
        fail += 1
      }
    }
    let cardSynced = 0
    let cardSkipped = 0
    if (ymOk) {
      try {
        const cardRes = await syncCardAllocationInputVatLedgers({
          months: period!.months,
          storeFilter: storeFilter || undefined,
          createdBy: String(auth.name || 'system'),
        })
        cardSynced = cardRes.synced
        cardSkipped = cardRes.skipped
      } catch (e) {
        console.warn('syncExpenseInputVatLedgers card sync:', e)
      }
    }

    return NextResponse.json(
      {
        success: true,
        processed: ok,
        failed: fail,
        skipped,
        scanned: (rows || []).length,
        cardSynced,
        cardSkipped,
      },
      { headers }
    )
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('syncExpenseInputVatLedgers:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
