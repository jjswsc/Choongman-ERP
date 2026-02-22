import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

/** 중복 판별용 키: trans_date | trans_type | amount(절대값) | memo */
function dupKey(transDate: string, transType: string, amount: number, memo: string): string {
  return `${transDate}|${transType}|${Math.abs(amount)}|${(memo || '').slice(0, 500)}`
}

/** 통장 거래 일괄 등록 (중복 거래는 자동 제외) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const accountId = Number(body.accountId || body.account_id)
    const store = String(body.store || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    const items = Array.isArray(body.items) ? body.items : []

    if (!accountId || isNaN(accountId)) {
      return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
    }
    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '등록할 거래가 없습니다.' }, { status: 400, headers })
    }

    const dates = items.map((i) => String(i.transDate || i.trans_date || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const minDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : ''
    const maxDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : ''

    const existingKeys = new Set<string>()
    if (minDate && maxDate) {
      const filter = `account_id=eq.${accountId}&trans_date=gte.${minDate}&trans_date=lte.${maxDate}`
      const existing = (await supabaseSelectFilter('bank_transactions', filter, {
        select: 'trans_date,trans_type,amount,memo',
        limit: 5000,
      })) as { trans_date?: string; trans_type?: string; amount?: number; memo?: string }[]
      for (const r of existing || []) {
        const d = String(r.trans_date || '').slice(0, 10)
        const t = String(r.trans_type || 'withdraw').toLowerCase()
        const a = Math.abs(Number(r.amount) || 0)
        const m = String(r.memo || '').trim().slice(0, 500)
        existingKeys.add(`${d}|${t}|${a}|${m}`)
      }
    }

    let inserted = 0
    let skipped = 0
    for (const item of items) {
      const transDate = String(item.transDate || item.trans_date || '').slice(0, 10)
      const transType = String(item.transType || item.trans_type || 'deposit').toLowerCase()
      const amount = Number(item.amount) || 0
      const memo = String(item.memo || '').trim()
      const note = String(item.note || '').trim()
      const category = String(item.category || 'expense').toLowerCase()
      const accountSubjectId = item.accountSubjectId ?? item.account_subject_id
      const salesDate = item.salesDate ?? item.sales_date
      const expenseDate = item.expenseDate ?? item.expense_date
      const vendorCode = String(item.vendorCode || item.vendor_code || '').trim()
      const storeNameForReceivable = String(item.storeName || item.store_name || '').trim()

      if (!transDate || amount <= 0) continue
      if (!['deposit', 'withdraw'].includes(transType)) continue

      const key = dupKey(transDate, transType, amount, memo)
      if (existingKeys.has(key)) {
        skipped++
        continue
      }
      existingKeys.add(key)

      const amt = transType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
      const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'correction', 'loan', 'advance', 'unclassified']
      const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']
      const validCategory = transType === 'deposit'
        ? (depositCategories.includes(category) ? category : 'revenue_delivery')
        : (withdrawCategories.includes(category) ? category : 'expense')

      const row: Record<string, unknown> = {
        account_id: accountId,
        trans_date: transDate,
        trans_type: transType,
        amount: amt,
        memo: memo || null,
        note: note || null,
        store: store || null,
        user_name: userName || null,
        category: validCategory,
      }
      if (accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        if (!isNaN(asid)) row.account_subject_id = asid
      }
      if (transType === 'deposit' && salesDate) {
        const sd = String(salesDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) row.sales_date = sd
      }
      if (transType === 'withdraw' && expenseDate) {
        const ed = String(expenseDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) row.expense_date = ed
      }
      if (validCategory === 'purchase_payment' && vendorCode) row.vendor_code = vendorCode
      if (validCategory === 'receivable_receive' && storeNameForReceivable) row.store_name = storeNameForReceivable

      const btInserted = (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
      const bankId = Array.isArray(btInserted) && btInserted[0] ? btInserted[0].id : undefined

      if (bankId && validCategory === 'purchase_payment' && vendorCode) {
        await supabaseInsert('payable_transactions', {
          vendor_code: vendorCode,
          amount: -Math.abs(amount),
          ref_type: 'Payment',
          ref_id: null,
          trans_date: transDate,
          memo: memo ? `통장 지급: ${memo.slice(0, 200)}` : '통장 지급',
          bank_transaction_id: bankId,
        })
      }
      if (bankId && validCategory === 'receivable_receive' && storeNameForReceivable) {
        await supabaseInsert('receivable_transactions', {
          store_name: storeNameForReceivable,
          amount: -Math.abs(amount),
          ref_type: 'Receive',
          ref_id: null,
          trans_date: transDate,
          memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
          bank_transaction_id: bankId,
        })
      }
      inserted++
    }

    const msg = skipped > 0
      ? `${inserted}건 등록, ${skipped}건 중복 제외`
      : `${inserted}건 등록되었습니다.`
    return NextResponse.json({ success: true, inserted, skipped, message: msg }, { headers })
  } catch (e) {
    console.error('addBankTransactionsBulk:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
