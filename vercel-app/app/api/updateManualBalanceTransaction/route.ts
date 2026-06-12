/**
 * 수동 미수금·미지급금(수령/지급/기초이월) 수정
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  canMutateManualPayableBalance,
  canMutateManualReceivableBalance,
  isAccountingRole,
  isOfficeRole,
} from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  defaultMemoForManualBalance,
  isManualPayableBalanceRow,
  isManualReceivableBalanceRow,
  signedAmountForManualBalance,
  type ManualBalanceLedger,
} from '@/lib/manual-balance-transaction'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
}

function assertReceivableMutateAllowed(
  userRole: string,
  userStore: string,
  allowedStores: string[],
  rowStoreName: string
): boolean {
  if (canMutateManualReceivableBalance(userRole, userStore, rowStoreName)) return true
  return allowedStores.some((s) => storesMatchForGradeLookup(s, rowStoreName))
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const ledger = String(body.type || body.ledger || '').trim().toLowerCase() as ManualBalanceLedger
    const id = Number(body.id ?? 0)
    const amount = Number(body.amount ?? 0)
    const transDate = String(body.transDate || body.trans_date || '').trim().slice(0, 10)
    const memo = String(body.memo || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)

    if (ledger !== 'receivable' && ledger !== 'payable') {
      return NextResponse.json(
        { success: false, message: 'type은 receivable 또는 payable이어야 합니다.' },
        { headers }
      )
    }
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: '유효한 id가 필요합니다.' }, { headers })
    }
    if (!transDate || transDate.length < 10) {
      return NextResponse.json({ success: false, message: '거래일을 입력해 주세요.' }, { headers })
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { headers })
    }

    if (ledger === 'receivable') {
      const rows = (await supabaseSelectFilter('receivable_transactions', `id=eq.${id}`, {
        limit: 1,
      })) as {
        id?: number
        store_name?: string
        amount?: number
        ref_type?: string
        ref_id?: number | null
        bank_transaction_id?: number | null
        trans_date?: string
        memo?: string
      }[] | null
      const row = rows?.[0]
      if (!row?.id) {
        return NextResponse.json({ success: false, message: '해당 미수금 내역을 찾을 수 없습니다.' }, { headers })
      }
      if (!isManualReceivableBalanceRow(row)) {
        return NextResponse.json(
          {
            success: false,
            message: '수동 수령·기초이월 건만 수정할 수 있습니다. 통장·주문 연동 건은 원본 화면에서 처리하세요.',
          },
          { headers }
        )
      }
      const currentStore = String(row.store_name || '').trim()
      if (!assertReceivableMutateAllowed(userRole, userStore, allowedStores, currentStore)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
      }
      const nextStore = storeName || currentStore
      if (!nextStore) {
        return NextResponse.json({ success: false, message: '매출처(storeName)를 입력해 주세요.' }, { headers })
      }
      if (!canSelectStores && !allowedStores.some((s) => storesMatchForGradeLookup(s, nextStore))) {
        return NextResponse.json({ success: false, message: '자기 매장만 수정할 수 있습니다.' }, { headers })
      }
      const refType = String(row.ref_type || 'Receive')
      const isOpening = refType === 'Opening'
      const signedAmount = signedAmountForManualBalance('receivable', refType, amount)
      await supabaseUpdate('receivable_transactions', id, {
        store_name: nextStore,
        amount: signedAmount,
        trans_date: transDate,
        memo: memo || defaultMemoForManualBalance(refType, isOpening),
      })
      return NextResponse.json({ success: true, message: '수령 내역이 수정되었습니다.' }, { headers })
    }

    if (!canMutateManualPayableBalance(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
    }
    const rows = (await supabaseSelectFilter('payable_transactions', `id=eq.${id}`, {
      limit: 1,
    })) as {
      id?: number
      vendor_code?: string
      amount?: number
      ref_type?: string
      ref_id?: number | null
      bank_transaction_id?: number | null
      expense_accrual_id?: number | null
      petty_cash_transaction_id?: number | null
      trans_date?: string
      memo?: string
    }[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '해당 미지급금 내역을 찾을 수 없습니다.' }, { headers })
    }
    if (!isManualPayableBalanceRow(row)) {
      return NextResponse.json(
        {
          success: false,
          message: '수동 지급·기초이월 건만 수정할 수 있습니다. 통장·발주·입고 연동 건은 원본 화면에서 처리하세요.',
        },
        { headers }
      )
    }
    const nextVendor = vendorCode || String(row.vendor_code || '').trim()
    if (!nextVendor) {
      return NextResponse.json({ success: false, message: '매입처(vendorCode)를 입력해 주세요.' }, { headers })
    }
    const refType = String(row.ref_type || 'Payment')
    const isOpening = refType === 'Opening'
    const signedAmount = signedAmountForManualBalance('payable', refType, amount)
    await supabaseUpdate('payable_transactions', id, {
      vendor_code: nextVendor,
      amount: signedAmount,
      trans_date: transDate,
      memo: memo || defaultMemoForManualBalance(refType, isOpening),
    })
    return NextResponse.json({ success: true, message: '지급 내역이 수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateManualBalanceTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
