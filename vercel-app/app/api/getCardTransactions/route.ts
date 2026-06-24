import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'

/** 카드 거래 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const cardAccountId = searchParams.get('cardAccountId')
  const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
  const endStr = String(searchParams.get('endStr') || '').slice(0, 10)

  try {
    const parts: string[] = []
    if (cardAccountId) parts.push(`card_account_id=eq.${cardAccountId}`)
    if (startStr && /^\d{4}-\d{2}-\d{2}$/.test(startStr)) parts.push(`trans_date=gte.${startStr}`)
    if (endStr && /^\d{4}-\d{2}-\d{2}$/.test(endStr)) parts.push(`trans_date=lte.${endStr}`)
    const filter = parts.length ? parts.join('&') : 'id=gt.0'

    const rows = (await supabaseSelectFilter('card_transactions', filter, {
      order: 'trans_date.desc,id.desc',
      limit: 20000,
      select:
        'id,card_account_id,trans_date,trans_type,amount,memo,bank_transaction_id,vendor_code,account_subject_id,note,is_bill_header,parent_id',
    })) as {
      id?: number
      card_account_id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      bank_transaction_id?: number
      vendor_code?: string
      account_subject_id?: number
      note?: string
      is_bill_header?: boolean
      parent_id?: number | null
    }[]

    const childSumByParent = new Map<number, number>()
    for (const r of rows || []) {
      const pid = Number(r.parent_id || 0)
      if (pid > 0) {
        childSumByParent.set(pid, (childSumByParent.get(pid) || 0) + Math.abs(Number(r.amount) || 0))
      }
    }

    const list = (rows || []).map((r) => {
      const id = Number(r.id || 0)
      const isBillHeader = Boolean(r.is_bill_header) || String(r.note || '').trim() === CARD_BILL_HEADER_NOTE
      const totalAmount = Math.abs(Number(r.amount) || 0)
      const allocatedAmount = isBillHeader ? childSumByParent.get(id) || 0 : 0
      return {
        id: r.id,
        cardAccountId: r.card_account_id,
        transDate: String(r.trans_date || '').slice(0, 10),
        transType: r.trans_type === 'charge' ? 'charge' : 'expense',
        amount: totalAmount,
        memo: (r.memo || '').toString().trim() || null,
        bankTransactionId: r.bank_transaction_id ?? null,
        vendorCode: (r.vendor_code || '').toString().trim() || null,
        accountSubjectId: r.account_subject_id ?? null,
        note: (r.note || '').toString().trim() || null,
        isBillHeader,
        parentId: r.parent_id != null ? Number(r.parent_id) : null,
        allocatedAmount,
        remainingAmount: isBillHeader ? Math.max(0, totalAmount - allocatedAmount) : 0,
        allocationComplete: isBillHeader && totalAmount > 0 && Math.abs(totalAmount - allocatedAmount) < 0.01,
      }
    })

    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getCardTransactions:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
