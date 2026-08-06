import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { canMutateExpenseAccrualRecord } from '@/lib/expense-accrual-approve-policy'
import { requireAuth } from '@/lib/verify-auth'

type AccrualRow = {
  id?: number
  payee_code?: string | null
  payee_name?: string | null
}

function decodePayeeCode(raw: string | undefined | null): string {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return src
  return src.slice(0, idx).trim()
}

function isMasterVendorCode(code: string): boolean {
  const c = String(code || '').trim()
  if (!c || c.startsWith('auto_')) return false
  if (/^card_\d+$/i.test(c)) return false
  return true
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
      // 빈 문자열도 명시 저장 — 비운 뒤 거래처 마스터 계좌로 다시 채워지지 않게 함
      await supabaseUpdate('expense_accruals', expenseAccrualId, {
        payee_account_holder: accountHolder,
        payee_bank_name: bankName,
        payee_bank_account_no: bankAccountNo,
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
    const payeeCode = decodePayeeCode(row.payee_code)
    if (syncVendor && isMasterVendorCode(payeeCode) && (bankName || bankAccountNo || accountHolder)) {
      try {
        const vendorPatch: Record<string, unknown> = {}
        if (bankAccountNo) vendorPatch.bank_account_no = bankAccountNo
        if (bankName) vendorPatch.bank_name = bankName
        // 예금주가 거래처명과 다를 때만 name 갱신하지 않음 — 계좌 마스터만 동기화
        if (Object.keys(vendorPatch).length > 0) {
          await supabaseUpdateByFilter('vendors', `code=eq.${encodeURIComponent(payeeCode)}`, vendorPatch)
          vendorSynced = true
        }
      } catch (vendorErr) {
        console.warn('updateExpenseAccrualPayeeBank vendor sync:', vendorErr)
        vendorSyncWarning =
          '지급 예정에는 저장됐지만 거래처 마스터 계좌 반영에 실패했습니다. 거래처 관리에서 확인하세요.'
      }
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
