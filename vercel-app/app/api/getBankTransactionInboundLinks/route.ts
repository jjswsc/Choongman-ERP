import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장 거래에 연동된 입고 배치 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const bankTxId = Number(searchParams.get('bankTransactionId') || searchParams.get('id') || 0)
    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json([], { headers })
    }

    const linkRows = (await supabaseSelectFilter(
      'bank_transaction_inbound_links',
      `bank_transaction_id=eq.${bankTxId}`,
      { order: 'id.asc', limit: 50 }
    )) as { id?: number; inbound_batch_id?: number; amount?: number }[]

    const result = (linkRows || []).map((r) => ({
      id: r.id,
      inboundBatchId: r.inbound_batch_id,
      amount: Number(r.amount) || 0,
    }))

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getBankTransactionInboundLinks:', e)
    return NextResponse.json([], { headers })
  }
}
