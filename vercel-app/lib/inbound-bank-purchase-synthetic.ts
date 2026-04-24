import 'server-only'

import { supabaseSelectFilter } from '@/lib/supabase-server'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export type InboundBankPurchaseSyntheticRow = {
  date: string
  vendor: string
  name: string
  spec: string
  qty: number
  amount: number
  vatAmount: number
  purchaseSource: 'store'
  inbound_batch_id: null
  bank_transaction_id: number
  row_kind: 'bank_purchase_payment'
}

function isPurchasePaymentBankRow(bt: {
  trans_type?: string
  amount?: number
  category?: string
  note?: string
}): boolean {
  const tt = String(bt.trans_type || '').toLowerCase()
  if (tt !== 'withdraw') return false
  const amt = Number(bt.amount || 0)
  if (amt >= 0) return false
  const cat = String(bt.category || '').toLowerCase()
  if (cat === 'purchase_payment') return true
  const note = String(bt.note || '').toLowerCase()
  return note.includes('purchase_payment')
}

function accountMatchesStoreFilter(
  accountStore: string,
  bankStoreName: string,
  storeFilter: string | undefined
): boolean {
  const f = String(storeFilter || '').trim()
  if (!f || f === 'All' || f === '전체 매장') return true
  const a = String(accountStore || '').trim()
  const b = String(bankStoreName || '').trim()
  return storesMatchForGradeLookup(a, f) || storesMatchForGradeLookup(b, f)
}

/**
 * 통장에서 매입 대금으로만 등록된 건(payable Payment + bank_transactions) — 품목 입고(stock_logs) 없음.
 * 입고 관리 목록에 합쳐 조회되도록 보조 행을 만든다.
 */
export async function fetchInboundBankPurchaseSyntheticRows(params: {
  startStr: string
  endStr: string
  /** 비우면 매장 제한 없음(상한으로 자름) */
  storeFilter?: string
  vendorFilter?: string
  maxRows?: number
}): Promise<InboundBankPurchaseSyntheticRow[]> {
  const { startStr, endStr, storeFilter, vendorFilter, maxRows = 120 } = params
  const out: InboundBankPurchaseSyntheticRow[] = []

  const ptRows = (await supabaseSelectFilter(
    'payable_transactions',
    `ref_type=eq.Payment&bank_transaction_id=not.is.null&trans_date=gte.${startStr}&trans_date=lte.${endStr}`,
    { order: 'id.desc', limit: 900, select: 'bank_transaction_id,vendor_code,trans_date' }
  )) as { bank_transaction_id?: number; vendor_code?: string; trans_date?: string }[] | null

  const bankIds = [...new Set((ptRows || []).map((r) => Number(r.bank_transaction_id)).filter((id) => id > 0))]
  if (bankIds.length === 0) return []

  type BankTxRow = {
    id?: number
    account_id?: number
    trans_date?: string
    trans_type?: string
    amount?: number
    category?: string
    note?: string
    vendor_code?: string
    store_name?: string
  }
  const bankRows = (await supabaseSelectFilter(
    'bank_transactions',
    `id=in.(${bankIds.join(',')})`,
    {
      limit: bankIds.length,
      select: 'id,account_id,trans_date,trans_type,amount,category,note,vendor_code,store_name',
    }
  )) as BankTxRow[] | null

  const bankById = new Map<number, BankTxRow>()
  for (const b of bankRows || []) {
    const id = Number(b.id)
    if (id) bankById.set(id, b)
  }

  const linkedRows = (await supabaseSelectFilter(
    'bank_transaction_inbound_links',
    `bank_transaction_id=in.(${bankIds.join(',')})`,
    {
      limit: 5000,
      select: 'bank_transaction_id,amount',
    }
  )) as { bank_transaction_id?: number; amount?: number }[] | null
  const linkedAmountByBankId = new Map<number, number>()
  for (const row of linkedRows || []) {
    const bankId = Number(row.bank_transaction_id || 0)
    if (!bankId) continue
    const amount = Math.abs(Number(row.amount || 0))
    if (amount <= 0) continue
    linkedAmountByBankId.set(bankId, (linkedAmountByBankId.get(bankId) || 0) + amount)
  }

  const accountIds = [...new Set((bankRows || []).map((b) => Number(b.account_id)).filter((id) => id > 0))]
  const accountById: Record<number, { store?: string | null }> = {}
  if (accountIds.length > 0) {
    const accRows = (await supabaseSelectFilter('bank_accounts', `id=in.(${accountIds.join(',')})`, {
      limit: accountIds.length,
      select: 'id,store',
    })) as { id?: number; store?: string | null }[] | null
    for (const a of accRows || []) {
      if (a.id) accountById[a.id] = { store: a.store }
    }
  }

  const vendorCodes = new Set<string>()
  for (const pt of ptRows || []) {
    const vc = String(pt.vendor_code || '').trim()
    if (vc) vendorCodes.add(vc)
  }
  for (const b of bankRows || []) {
    const vc = String(b.vendor_code || '').trim()
    if (vc) vendorCodes.add(vc)
  }

  const vendorNameByCode: Record<string, string> = {}
  if (vendorCodes.size > 0) {
    const codes = [...vendorCodes]
    const inList = codes.map((c) => encodeURIComponent(c)).join(',')
    const vRows = (await supabaseSelectFilter('vendors', `code=in.(${inList})`, {
      limit: 500,
      select: 'code,name',
    })) as { code?: string; name?: string }[] | null
    for (const v of vRows || []) {
      const c = String(v.code || '').trim()
      if (c) vendorNameByCode[c] = String(v.name || c).trim() || c
    }
  }

  const seenBank = new Set<number>()
  for (const pt of ptRows || []) {
    if (out.length >= maxRows) break
    const bid = Number(pt.bank_transaction_id)
    if (!bid || seenBank.has(bid)) continue
    const bt = bankById.get(bid)
    if (!bt || !isPurchasePaymentBankRow(bt)) continue

    const accId = Number(bt.account_id)
    const acc = accId ? accountById[accId] : undefined
    const accStore = String(acc?.store || '').trim()
    const btStoreName = String(bt.store_name || '').trim()
    if (!accountMatchesStoreFilter(accStore, btStoreName, storeFilter)) continue

    const vCode = String(bt.vendor_code || pt.vendor_code || '').trim()
    const vendorLabel = vCode ? vendorNameByCode[vCode] || vCode : '—'
    if (
      vendorFilter &&
      vendorFilter !== 'All' &&
      vendorFilter !== '전체 매입처' &&
      vendorLabel !== vendorFilter &&
      vCode !== vendorFilter
    ) {
      continue
    }

    const transDate = String(bt.trans_date || pt.trans_date || '').slice(0, 10)
    const paidAmount = Math.abs(Number(bt.amount || 0))
    const linkedAmount = Math.abs(Number(linkedAmountByBankId.get(bid) || 0))
    // 중복 방지: 입고 연동 이력이 1건이라도 있으면 통장 보조행은 노출하지 않는다.
    if (linkedAmount > 0) continue

    seenBank.add(bid)
    out.push({
      date: transDate,
      vendor: vendorLabel,
      name: '__BANK_PURCHASE_PAYMENT__',
      spec: '—',
      qty: 1,
      amount: paidAmount,
      vatAmount: 0,
      purchaseSource: 'store',
      inbound_batch_id: null,
      bank_transaction_id: bid,
      row_kind: 'bank_purchase_payment',
    })
  }

  return out
}
