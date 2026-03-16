import { NextRequest, NextResponse } from 'next/server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { hasJournalForSource, postBankTransactionJournal, postPettyCashJournal, postPosOrderJournal, postStorePurchaseJournal } from '@/lib/accounting-posting'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function getRangeByMonths(months: number): { startStr: string; endStr: string } {
  const endStr = getBangkokTodayDateString()
  const y = Number(endStr.slice(0, 4))
  const m = Number(endStr.slice(5, 7))
  const d = 1
  const startDate = new Date(Date.UTC(y, m - 1 - Math.max(0, months - 1), d))
  const startStr = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-01`
  return { startStr, endStr }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const months = Math.max(1, Math.min(24, Number(body.months || 6)))
    const dryRun = Boolean(body.dryRun)
    const { startStr, endStr } = getRangeByMonths(months)

    let bankCreated = 0
    let pettyCreated = 0
    let posCreated = 0
    let purchaseCreated = 0
    let skipped = 0

    const bankRows = (await supabaseSelectFilter(
      'bank_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}`,
      { select: 'id,trans_date,trans_type,amount,category,memo,store,user_name', limit: 50000 }
    )) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      category?: string
      memo?: string
      store?: string
      user_name?: string
    }[] | null
    for (const row of bankRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('bank_transaction', id)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        await postBankTransactionJournal({
          bankTransactionId: id,
          transDate: String(row.trans_date || '').slice(0, 10),
          transType: (String(row.trans_type || 'withdraw').toLowerCase() === 'deposit' ? 'deposit' : 'withdraw'),
          amountAbs: Math.abs(Number(row.amount) || 0),
          category: String(row.category || ''),
          memo: String(row.memo || ''),
          storeName: String(row.store || ''),
          postedBy: String(row.user_name || ''),
        })
      }
      bankCreated += 1
    }

    const pettyRows = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
      { select: 'id,trans_date,trans_type,amount,memo,store,user_name', limit: 50000 }
    )) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      store?: string
      user_name?: string
    }[] | null
    for (const row of pettyRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('petty_cash', id)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        await postPettyCashJournal({
          pettyCashId: id,
          transDate: String(row.trans_date || '').slice(0, 10),
          transType: String(row.trans_type || ''),
          amountAbs: Math.abs(Number(row.amount) || 0),
          memo: String(row.memo || ''),
          storeName: String(row.store || ''),
          postedBy: String(row.user_name || ''),
        })
      }
      pettyCreated += 1
    }

    const posRows = (await supabaseSelectFilter(
      'pos_orders',
      `created_at=gte.${startStr}T00:00:00.000Z&created_at=lte.${endStr}T23:59:59.999Z&status=in.(completed,paid,ready)`,
      { select: 'id,total,store_code,created_at', limit: 50000 }
    )) as { id?: number; total?: number; store_code?: string; created_at?: string }[] | null
    for (const row of posRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('pos_order', id)) {
        skipped += 1
        continue
      }
      const salesDate = row.created_at
        ? new Date(String(row.created_at)).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        : getBangkokTodayDateString()
      if (!dryRun) {
        await postPosOrderJournal({
          posOrderId: id,
          salesDate,
          total: Number(row.total || 0),
          storeName: String(row.store_code || ''),
          memo: 'POS 매출 백필 분개',
        })
      }
      posCreated += 1
    }

    const recvRows = (await supabaseSelectFilter(
      'receivable_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&ref_type=eq.Order`,
      { select: 'ref_id,store_name,amount,trans_date', limit: 50000 }
    )) as { ref_id?: number; store_name?: string; amount?: number; trans_date?: string }[] | null
    for (const row of recvRows || []) {
      const orderId = Number(row.ref_id || 0)
      if (!orderId) continue
      if (await hasJournalForSource('store_purchase', orderId)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        await postStorePurchaseJournal({
          orderId,
          transDate: String(row.trans_date || '').slice(0, 10),
          amount: Number(row.amount || 0),
          storeName: String(row.store_name || ''),
          memo: '매입/매출채권 백필 분개',
        })
      }
      purchaseCreated += 1
    }

    return NextResponse.json({
      success: true,
      range: { startStr, endStr, months },
      dryRun,
      created: {
        bank: bankCreated,
        pettyCash: pettyCreated,
        posSales: posCreated,
        storePurchase: purchaseCreated,
      },
      skipped,
      totalCreated: bankCreated + pettyCreated + posCreated + purchaseCreated,
    }, { headers })
  } catch (e) {
    console.error('accounting/backfill:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

