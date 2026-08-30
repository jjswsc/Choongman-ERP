import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import {
  accountingPeriodClosedMessage,
  isAccountingPeriodClosedError,
} from '@/lib/accounting-period-mutation-guard'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'
import { deleteCardTransactionInputVatLedger } from '@/lib/card-input-vat-ledger'

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
      select: 'id,bank_transaction_id,is_bill_header,note,trans_date',
    })) as {
      id?: number
      bank_transaction_id?: number | null
      is_bill_header?: boolean
      note?: string | null
      trans_date?: string | null
    }[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const bankTransactionId = Number(row.bank_transaction_id || 0)
    const isHeader = Boolean(row.is_bill_header) || String(row.note || '').trim() === CARD_BILL_HEADER_NOTE

    await assertAccountingDateOpen(String(row.trans_date || '').slice(0, 10), null)

    if (isHeader) {
      const children = (await supabaseSelectFilter('card_transactions', `parent_id=eq.${id}`, {
        select: 'id,trans_date',
        limit: 500,
      })) as { id?: number; trans_date?: string | null }[] | null
      for (const child of children || []) {
        const cid = Number(child.id || 0)
        if (cid > 0) {
          await assertAccountingDateOpen(String(child.trans_date || row.trans_date || '').slice(0, 10), null)
          await deleteCardTransactionInputVatLedger(cid)
          await deleteJournalEntriesBySource('card_transaction', cid)
          await supabaseDeleteByFilter('card_transactions', `id=eq.${cid}`)
        }
      }
    }

    await deleteCardTransactionInputVatLedger(id)
    await deleteJournalEntriesBySource('card_transaction', id)
    if (bankTransactionId > 0) {
      await deleteJournalEntriesBySource('bank_transaction', bankTransactionId)
    }
    await supabaseDeleteByFilter('card_transactions', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteCardTransaction:', e)
    if (isAccountingPeriodClosedError(e)) {
      return NextResponse.json(
        { success: false, message: accountingPeriodClosedMessage('delete') },
        { status: 409, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
