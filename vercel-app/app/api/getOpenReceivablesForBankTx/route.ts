import { NextRequest, NextResponse } from 'next/server'
import { loadOpenReceivablesForBankTx } from '@/lib/bank-receivable-link-server'
import { sumStoreCreditAvailable } from '@/lib/bank-receivable-store-credit'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/** 통장 입금(receivable_receive)과 매칭 가능한 미수금(출고·주문) 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const { searchParams } = new URL(request.url)
    const bankTransactionId = Number(searchParams.get('bankTransactionId') || 0)
    if (!bankTransactionId) {
      return NextResponse.json(
        { success: false, message: '통장 거래 ID가 필요합니다.', list: [] },
        { status: 400, headers }
      )
    }

    const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      select: 'id,trans_type,category,amount,trans_date,memo,store_name,store',
      limit: 1,
    })) as {
      id?: number
      trans_type?: string
      category?: string
      amount?: number
      trans_date?: string
      memo?: string
      store_name?: string | null
      store?: string | null
    }[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) {
      return NextResponse.json(
        { success: false, message: '통장 거래를 찾을 수 없습니다.', list: [] },
        { status: 404, headers }
      )
    }

    const list = await loadOpenReceivablesForBankTx(bankRow)
    const bankStore = String(bankRow.store_name || bankRow.store || '').trim()
    const storeCreditAvailable = bankStore ? await sumStoreCreditAvailable(bankStore) : 0
    return NextResponse.json({ success: true, list, storeCreditAvailable }, { headers })
  } catch (e) {
    console.error('getOpenReceivablesForBankTx:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패', list: [] },
      { status: 500, headers }
    )
  }
}
