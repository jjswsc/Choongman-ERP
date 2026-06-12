/**
 * 수동 미수금·미지급금(수령/지급/기초이월) 삭제
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  canMutateManualPayableBalance,
  canMutateManualReceivableBalance,
} from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  isManualPayableBalanceRow,
  isManualReceivableBalanceRow,
  type ManualBalanceLedger,
} from '@/lib/manual-balance-transaction'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
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
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)

    if (ledger !== 'receivable' && ledger !== 'payable') {
      return NextResponse.json(
        { success: false, message: 'type은 receivable 또는 payable이어야 합니다.' },
        { headers }
      )
    }
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: '유효한 id가 필요합니다.' }, { headers })
    }

    if (ledger === 'receivable') {
      const rows = (await supabaseSelectFilter('receivable_transactions', `id=eq.${id}`, {
        limit: 1,
      })) as {
        id?: number
        store_name?: string
        ref_type?: string
        ref_id?: number | null
        bank_transaction_id?: number | null
      }[] | null
      const row = rows?.[0]
      if (!row?.id) {
        return NextResponse.json({ success: false, message: '해당 미수금 내역을 찾을 수 없습니다.' }, { headers })
      }
      if (!isManualReceivableBalanceRow(row)) {
        return NextResponse.json(
          {
            success: false,
            message: '수동 수령·기초이월 건만 삭제할 수 있습니다. 통장·주문 연동 건은 원본 화면에서 처리하세요.',
          },
          { headers }
        )
      }
      const storeName = String(row.store_name || '').trim()
      const allowed =
        canMutateManualReceivableBalance(userRole, userStore, storeName) ||
        allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
      if (!allowed) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
      }
      await supabaseDeleteByFilter('receivable_transactions', `id=eq.${id}`)
      return NextResponse.json({ success: true, message: '수령 내역이 삭제되었습니다.' }, { headers })
    }

    if (!canMutateManualPayableBalance(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
    }
    const rows = (await supabaseSelectFilter('payable_transactions', `id=eq.${id}`, {
      limit: 1,
    })) as {
      id?: number
      ref_type?: string
      ref_id?: number | null
      bank_transaction_id?: number | null
      expense_accrual_id?: number | null
      petty_cash_transaction_id?: number | null
    }[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '해당 미지급금 내역을 찾을 수 없습니다.' }, { headers })
    }
    if (!isManualPayableBalanceRow(row)) {
      return NextResponse.json(
        {
          success: false,
          message: '수동 지급·기초이월 건만 삭제할 수 있습니다. 통장·발주·입고 연동 건은 원본 화면에서 처리하세요.',
        },
        { headers }
      )
    }
    await supabaseDeleteByFilter('payable_transactions', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '지급 내역이 삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteManualBalanceTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
