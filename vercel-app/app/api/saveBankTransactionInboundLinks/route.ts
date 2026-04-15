import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 통장 출금 입고 연동 저장 - 기존 링크 삭제 후 새로 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const bankTxId = Number(body.bankTransactionId ?? body.bankTxId ?? body.id ?? 0)
    const links = Array.isArray(body.links) ? body.links : []
    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const validLinks = links
      .map((l: { inboundBatchId?: number; amount?: number }) => ({
        inbound_batch_id: Number(l.inboundBatchId ?? 0),
        amount: Number(l.amount ?? 0) || 0,
      }))
      .filter((l: { inbound_batch_id: number; amount: number }) => l.inbound_batch_id > 0 && l.amount > 0)

    await supabaseDeleteByFilter('bank_transaction_inbound_links', `bank_transaction_id=eq.${bankTxId}`)

    for (const link of validLinks) {
      await supabaseInsert('bank_transaction_inbound_links', {
        bank_transaction_id: bankTxId,
        inbound_batch_id: link.inbound_batch_id,
        amount: link.amount,
      })
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveBankTransactionInboundLinks:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
