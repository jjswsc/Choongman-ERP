import { NextRequest, NextResponse } from 'next/server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  hasJournalForSource,
  postBankTransactionJournal,
  postCardTransactionJournal,
  postPettyCashJournal,
  postPosOrderJournal,
  postStorePurchaseJournal,
} from '@/lib/accounting-posting'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function isPeriodClosedError(e: unknown): boolean {
  return e instanceof Error && e.message === 'ACCOUNTING_PERIOD_CLOSED'
}

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
    let cardCreated = 0
    let posCreated = 0
    let purchaseCreated = 0
    let skipped = 0

    const bankRows = (await supabaseSelectFilter(
      'bank_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}`,
      { select: 'id,trans_date,trans_type,amount,category,memo,store,user_name,account_subject_id', limit: 50000 }
    )) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      category?: string
      memo?: string
      store?: string
      user_name?: string
      account_subject_id?: number | null
    }[] | null
    for (const row of bankRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('bank_transaction', id)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        try {
          await postBankTransactionJournal({
            bankTransactionId: id,
            transDate: String(row.trans_date || '').slice(0, 10),
            transType: (String(row.trans_type || 'withdraw').toLowerCase() === 'deposit' ? 'deposit' : 'withdraw'),
            amountAbs: Math.abs(Number(row.amount) || 0),
            category: String(row.category || ''),
            memo: String(row.memo || ''),
            storeName: String(row.store || ''),
            postedBy: String(row.user_name || ''),
            accountSubjectId:
              row.account_subject_id != null && !isNaN(Number(row.account_subject_id))
                ? Number(row.account_subject_id)
                : null,
          })
        } catch (e) {
          if (isPeriodClosedError(e)) {
            skipped += 1
            continue
          }
          throw e
        }
      }
      bankCreated += 1
    }

    const pettyRows = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
      { select: 'id,trans_date,trans_type,amount,memo,store,user_name,account_subject_id', limit: 50000 }
    )) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      store?: string
      user_name?: string
      account_subject_id?: number | null
    }[] | null
    for (const row of pettyRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('petty_cash', id)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        try {
          await postPettyCashJournal({
            pettyCashId: id,
            transDate: String(row.trans_date || '').slice(0, 10),
            transType: String(row.trans_type || ''),
            amountAbs: Math.abs(Number(row.amount) || 0),
            memo: String(row.memo || ''),
            storeName: String(row.store || ''),
            postedBy: String(row.user_name || ''),
            accountSubjectId:
              row.account_subject_id != null && !isNaN(Number(row.account_subject_id))
                ? Number(row.account_subject_id)
                : null,
          })
        } catch (e) {
          if (isPeriodClosedError(e)) {
            skipped += 1
            continue
          }
          throw e
        }
      }
      pettyCreated += 1
    }

    const cardRows = (await supabaseSelectFilter(
      'card_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}`,
      { select: 'id,trans_date,trans_type,amount,memo,account_subject_id', limit: 50000 }
    )) as {
      id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      account_subject_id?: number | null
    }[] | null
    for (const row of cardRows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (await hasJournalForSource('card_transaction', id)) {
        skipped += 1
        continue
      }
      if (!dryRun) {
        try {
          await postCardTransactionJournal({
            cardTransactionId: id,
            transDate: String(row.trans_date || '').slice(0, 10),
            transType: String(row.trans_type || '').toLowerCase() === 'charge' ? 'charge' : 'expense',
            amountAbs: Math.abs(Number(row.amount) || 0),
            memo: String(row.memo || ''),
            accountSubjectId:
              row.account_subject_id != null && !isNaN(Number(row.account_subject_id))
                ? Number(row.account_subject_id)
                : null,
          })
        } catch (e) {
          if (isPeriodClosedError(e)) {
            skipped += 1
            continue
          }
          throw e
        }
      }
      cardCreated += 1
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
        try {
          await postStorePurchaseJournal({
            orderId,
            transDate: String(row.trans_date || '').slice(0, 10),
            amount: Number(row.amount || 0),
            storeName: String(row.store_name || ''),
            memo: '매입/매출채권 백필 분개',
          })
        } catch (e) {
          if (isPeriodClosedError(e)) {
            skipped += 1
            continue
          }
          throw e
        }
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
        cardExpense: cardCreated,
        posSales: posCreated,
        storePurchase: purchaseCreated,
      },
      skipped,
      totalCreated: bankCreated + pettyCreated + cardCreated + posCreated + purchaseCreated,
    }, { headers })
  } catch (e) {
    console.error('accounting/backfill:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

