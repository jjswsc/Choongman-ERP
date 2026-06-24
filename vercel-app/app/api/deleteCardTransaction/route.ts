import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'

/** 카드 거래 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = Number(body.id ?? body.transactionId ?? 0)
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }
    const rows = (await supabaseSelectFilter('card_transactions', `id=eq.${id}`, {
      limit: 1,
      select: 'id,bank_transaction_id,is_bill_header,note',
    })) as { id?: number; bank_transaction_id?: number | null; is_bill_header?: boolean; note?: string | null }[] | null
    const bankTransactionId = Number(rows?.[0]?.bank_transaction_id || 0)
    const isHeader = Boolean(rows?.[0]?.is_bill_header) || String(rows?.[0]?.note || '').trim() === CARD_BILL_HEADER_NOTE

    if (isHeader) {
      const children = (await supabaseSelectFilter('card_transactions', `parent_id=eq.${id}`, {
        select: 'id',
        limit: 500,
      })) as { id?: number }[] | null
      for (const child of children || []) {
        const cid = Number(child.id || 0)
        if (cid > 0) {
          await deleteJournalEntriesBySource('card_transaction', cid)
          await supabaseDeleteByFilter('card_transactions', `id=eq.${cid}`)
        }
      }
    }

    await deleteJournalEntriesBySource('card_transaction', id)
    if (bankTransactionId > 0) {
      await deleteJournalEntriesBySource('bank_transaction', bankTransactionId)
    }
    await supabaseDeleteByFilter('card_transactions', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteCardTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
