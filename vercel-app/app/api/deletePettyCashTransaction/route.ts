import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import { deletePettyCashInputVatLedger } from '@/lib/petty-input-vat-ledger'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** 패티캐시 거래 삭제 - 월별 현황 등 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const id = Number(body.id)
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)

    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('petty_cash_transactions', `id=eq.${id}`, {
      limit: 1,
      select: 'id,store,trans_date,bank_transaction_id,trans_type',
    })) as { id?: number; store?: string; trans_date?: string; bank_transaction_id?: number | null; trans_type?: string }[]

    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '해당 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const transDate = String(row.trans_date || '').slice(0, 10)
    await assertAccountingDateOpen(transDate)

    const store = String(row.store || '').trim()
    const isScopedRole =
      !isOfficeRole(userRole) && !isAccountingRole(userRole) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, store))
      if (!allowed) {
        return NextResponse.json({ success: false, message: '해당 매장만 삭제할 수 있습니다.' }, { status: 403, headers })
      }
    }

    const payables = (await supabaseSelectFilter(
      'payable_transactions',
      `petty_cash_transaction_id=eq.${id}`,
      { limit: 50, select: 'id,expense_accrual_id' }
    )) as { id?: number; expense_accrual_id?: number | null }[]

    for (const p of payables || []) {
      if (Number(p.expense_accrual_id || 0) > 0) {
        return NextResponse.json(
          { success: false, message: '지급예정과 연결된 패티캐시 건은 삭제할 수 없습니다.' },
          { status: 400, headers }
        )
      }
    }

    await deleteJournalEntriesBySource('petty_cash', id, {})
    const bankTxId = Number(row.bank_transaction_id || 0)
    if (bankTxId > 0 && String(row.trans_type || '').toLowerCase() === 'replenish') {
      await deleteJournalEntriesBySource('bank_transaction', bankTxId, {})
    }
    await deletePettyCashInputVatLedger(id)

    if ((payables || []).length > 0) {
      await supabaseDeleteByFilter('payable_transactions', `petty_cash_transaction_id=eq.${id}`)
    }

    await supabaseDeleteByFilter('petty_cash_transactions', `id=eq.${id}`)

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePettyCashTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
