import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      cardAccountId: r.card_account_id,
      transDate: String(r.trans_date || '').slice(0, 10),
      transType: r.trans_type === 'charge' ? 'charge' : 'expense',
      amount: Number(r.amount) || 0,
      memo: (r.memo || '').toString().trim() || null,
      bankTransactionId: r.bank_transaction_id ?? null,
      vendorCode: (r.vendor_code || '').toString().trim() || null,
      accountSubjectId: r.account_subject_id ?? null,
      note: (r.note || '').toString().trim() || null,
    }))

    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getCardTransactions:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
