import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 지출 등록(executeWithdrawal)으로 생성된 통장 출금 거래 목록 검색
 * note에 withdrawal_category 포함된 bank_transactions
 * 통장거래의 인보이스 사진/체크박스와 동일 레코드로 연동됨 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const accountId = String(searchParams.get('accountId') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const categoryFilter = String(searchParams.get('category') || '').trim().toLowerCase()

  if (!startStr || !endStr) {
    return NextResponse.json({ list: [] }, { headers })
  }

  try {
    const parts: string[] = [
      'trans_type=eq.withdraw',
      `note=ilike.${encodeURIComponent('*withdrawal_category*')}`,
      `trans_date=gte.${startStr}`,
      `trans_date=lte.${endStr}`,
    ]
    if (accountId) parts.push(`account_id=eq.${accountId}`)
    if (categoryFilter) parts.push(`category=ilike.${encodeURIComponent(categoryFilter)}`)

    const filter = parts.join('&')
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      order: 'trans_date.desc,id.desc',
      limit: 20000,
      select: 'id,account_id,trans_date,trans_type,amount,memo,note,category,account_subject_id,expense_date,vendor_code,store_name,invoice_received,invoice_no,invoice_photo_url',
    })) as {
      id?: number
      account_id?: number
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      note?: string
      category?: string
      account_subject_id?: number
      expense_date?: string
      vendor_code?: string
      store_name?: string
      invoice_received?: boolean
      invoice_no?: string
      invoice_photo_url?: string
    }[]

    const [payableLinks, inboundLinks, cardLinks] = await Promise.all([
      supabaseSelectFilter('payable_transactions', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id,expense_accrual_id,petty_cash_transaction_id',
        limit: 20000,
      }) as Promise<{ bank_transaction_id?: number; expense_accrual_id?: number | null; petty_cash_transaction_id?: number | null }[]>,
      supabaseSelectFilter('bank_transaction_inbound_links', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id',
        limit: 20000,
      }).catch(() => [] as { bank_transaction_id?: number }[]),
      supabaseSelectFilter('card_transactions', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id',
        limit: 20000,
      }).catch(() => [] as { bank_transaction_id?: number }[]),
    ])

    const payableSet = new Set<number>()
    const plannedSet = new Set<number>()
    const bankToAccrualMap = new Map<number, number>()
    const accrualPettySet = new Set<number>()
    for (const p of payableLinks || []) {
      const bid = Number(p.bank_transaction_id || 0)
      const accrualId = Number(p.expense_accrual_id || 0)
      if (bid) {
        payableSet.add(bid)
        if (accrualId > 0) {
          plannedSet.add(bid)
          bankToAccrualMap.set(bid, accrualId)
        }
      }
      if (accrualId > 0 && Number(p.petty_cash_transaction_id || 0) > 0) {
        accrualPettySet.add(accrualId)
      }
    }
    const inboundSet = new Set<number>((inboundLinks || []).map((r: { bank_transaction_id?: number }) => Number(r.bank_transaction_id || 0)).filter(Boolean))
    const cardSet = new Set<number>((cardLinks || []).map((r: { bank_transaction_id?: number }) => Number(r.bank_transaction_id || 0)).filter(Boolean))

    const mapped = (rows || []).map((r) => {
      const note = String(r.note || '')
      const catMatch = note.match(/withdrawal_category:([a-z_]+)/i)
      const cat = (catMatch?.[1] || '').toLowerCase() || r.category || 'expense'
      const id = Number(r.id || 0)
      const linkedAccrualId = Number(bankToAccrualMap.get(id) || 0)
      const pettyLinked = linkedAccrualId > 0 && accrualPettySet.has(linkedAccrualId)
      const bankLinked = payableSet.has(id) || inboundSet.has(id) || cardSet.has(id)
      const linkStatus = plannedSet.has(id)
        ? 'bank_plan'
        : pettyLinked
          ? 'petty'
        : payableSet.has(id)
          ? 'bank'
          : inboundSet.has(id)
            ? 'inbound'
            : cardSet.has(id)
              ? 'card'
              : 'unlinked'
      return {
        id: r.id,
        accountId: r.account_id,
        transDate: String(r.trans_date || '').slice(0, 10),
        transType: 'withdraw',
        amount: Math.abs(Number(r.amount) || 0),
        memo: String(r.memo || '').trim(),
        category: cat,
        accountSubjectId: r.account_subject_id ?? null,
        expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : undefined,
        vendorCode: r.vendor_code ? String(r.vendor_code).trim() : undefined,
        storeName: r.store_name ? String(r.store_name).trim() : undefined,
        invoiceReceived: Boolean(r.invoice_received),
        invoiceNo: r.invoice_no ? String(r.invoice_no).trim() : undefined,
        invoicePhotoUrl: r.invoice_photo_url ? String(r.invoice_photo_url).trim() : undefined,
        linkStatus,
        bankLinked,
        pettyLinked,
      }
    })

    const dedupKey = (r: (typeof mapped)[0]) =>
      `${r.transDate}|${r.amount}|${r.vendorCode ?? ''}|${(r.memo ?? '').slice(0, 100)}`
    const byKey = new Map<string, (typeof mapped)[0]>()
    for (const r of mapped) {
      const k = dedupKey(r)
      const existing = byKey.get(k)
      if (!existing || (r.id ?? 0) > (existing.id ?? 0)) {
        byKey.set(k, r)
      }
    }
    const list = Array.from(byKey.values()).sort(
      (a, b) => (b.transDate || '').localeCompare(a.transDate || '') || ((b.id ?? 0) - (a.id ?? 0))
    )

    return NextResponse.json({ list }, { headers })
  } catch (e) {
    console.error('getExpenseRegisterList:', e)
    return NextResponse.json({ list: [] }, { headers })
  }
}
