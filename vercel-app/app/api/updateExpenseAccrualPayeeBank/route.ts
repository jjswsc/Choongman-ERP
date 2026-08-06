import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canMutateExpenseAccrualRecord } from '@/lib/expense-accrual-approve-policy'
import {
  decodeExpensePayeeMasterCode,
  syncVendorBankFromExpense,
} from '@/lib/expense-vendor-bank-sync'
import { requireAuth } from '@/lib/verify-auth'

type AccrualRow = {
  id?: number
  payee_code?: string | null
  payee_name?: string | null
}

/**
 * 이체용 예금주·은행·계좌를 expense_accruals 스냅샷에 저장.
 * payee_code가 거래처 마스터면 vendors에도 반영(옵션).
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const body = await request.json()
    const effectiveRole = String(authResult.auth.role || body.userRole || body.user_role || '').trim()
    if (!canMutateExpenseAccrualRecord(effectiveRole)) {
      return NextResponse.json(
        { success: false, message: '본사 또는 회계 권한이 필요합니다.' },
        { status: 403, headers }
      )
    }

    const expenseAccrualId = Number(body.expenseAccrualId || body.expense_accrual_id || 0)
    if (!expenseAccrualId) {
      return NextResponse.json({ success: false, message: '지급 예정 ID가 필요합니다.' }, { status: 400, headers })
    }

    const accountHolder = String(body.payeeAccountHolder || body.payee_account_holder || '').trim()
    const bankName = String(body.payeeBankName || body.payee_bank_name || '').trim()
    const bankAccountNo = String(body.payeeBankAccountNo || body.payee_bank_account_no || '').trim()
    const syncVendor = body.syncVendor !== false && body.sync_vendor !== false

    const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
      select: 'id,payee_code,payee_name',
      limit: 1,
    })) as AccrualRow[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '지급 예정 데이터를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    try {
      // 빈 값은 null → 조회 시 거래처 마스터 계좌 fallback
      await supabaseUpdate('expense_accruals', expenseAccrualId, {
        payee_account_holder: accountHolder || null,
        payee_bank_name: bankName || null,
        payee_bank_account_no: bankAccountNo || null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/payee_bank|payee_account|column/i.test(msg)) {
        return NextResponse.json(
          {
            success: false,
            message:
              '이체 계좌 컬럼이 없습니다. sql/expense_payee_bank_transfer_fields.sql 을 Supabase에서 실행해 주세요.',
          },
          { status: 400, headers }
        )
      }
      throw e
    }

    let vendorSynced = false
    let vendorSyncWarning: string | null = null
    const payeeCode = decodeExpensePayeeMasterCode(row.payee_code)
    if (syncVendor && (bankName || bankAccountNo)) {
      const sync = await syncVendorBankFromExpense({
        payeeCode,
        bankName,
        bankAccountNo,
      })
      vendorSynced = sync.synced
      vendorSyncWarning = sync.warning
    }

    return NextResponse.json(
      {
        success: true,
        payeeAccountHolder: accountHolder,
        payeeBankName: bankName,
        payeeBankAccountNo: bankAccountNo,
        vendorSynced,
        ...(vendorSyncWarning ? { vendorSyncWarning, message: vendorSyncWarning } : {}),
      },
      { headers }
    )
  } catch (e) {
    console.error('updateExpenseAccrualPayeeBank:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
