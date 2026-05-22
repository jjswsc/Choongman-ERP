import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  try {
    const { searchParams } = new URL(request.url)
    const storeCode = String(searchParams.get('storeCode') || searchParams.get('store_code') || '').trim()
    const settleDate = String(searchParams.get('settleDate') || searchParams.get('settle_date') || '').slice(0, 10)
    if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(settleDate)) {
      return NextResponse.json({ success: false, message: 'INVALID_PARAMS' }, { status: 400, headers })
    }
    const rows = (await supabaseSelectFilter(
      'pos_channel_settlements',
      `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(settleDate)}`,
      {
        select:
          'id,store_code,settle_date,channel,gross_amt,fee_amt,net_amt,fee_source,memo,bank_transaction_id,journal_entry_id,created_at,updated_at',
        limit: 20,
        order: 'channel.asc',
      }
    )) as Record<string, unknown>[] | null

    return NextResponse.json(
      {
        success: true,
        settlements: (rows || []).map((r) => ({
          id: Number(r.id) || 0,
          storeCode: String(r.store_code ?? ''),
          settleDate: String(r.settle_date ?? '').slice(0, 10),
          channel: String(r.channel ?? ''),
          gross: Number(r.gross_amt) || 0,
          fee: Number(r.fee_amt) || 0,
          net: Number(r.net_amt) || 0,
          feeSource: r.fee_source != null ? String(r.fee_source) : null,
          memo: r.memo != null ? String(r.memo) : null,
          bankTransactionId: r.bank_transaction_id != null ? Number(r.bank_transaction_id) : null,
          journalEntryId: r.journal_entry_id != null ? Number(r.journal_entry_id) : null,
        })),
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosChannelSettlements:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
