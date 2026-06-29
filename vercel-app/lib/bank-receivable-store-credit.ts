import { receivableStoreMatchesBank, roundReceivableMoney } from '@/lib/bank-receivable-link'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

export type StoreCreditItem = {
  id: number
  transDate: string
  amount: number
  remaining: number
  memo?: string
}

type StoreCreditRow = {
  id?: number
  store_name?: string
  amount?: number
  trans_date?: string
  memo?: string
  ref_type?: string
}

type CreditApplyRow = {
  ref_id?: number
  amount?: number
}

export async function loadStoreCreditItemsForStore(storeName: string): Promise<StoreCreditItem[]> {
  const store = String(storeName || '').trim()
  if (!store) return []

  const creditRows = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.StoreCredit&amount=gt.0`,
    {
      select: 'id,store_name,amount,trans_date,memo',
      order: 'trans_date.asc,id.asc',
      limit: 500,
    }
  )) as StoreCreditRow[] | null

  const scoped = (creditRows || []).filter((r) =>
    receivableStoreMatchesBank(String(r.store_name || ''), store)
  )
  if (scoped.length === 0) return []

  const creditIds = scoped.map((r) => Number(r.id || 0)).filter((id) => id > 0)
  const appliedByCredit = new Map<number, number>()
  for (let i = 0; i < creditIds.length; i += 80) {
    const chunk = creditIds.slice(i, i + 80)
    const applyRows = (await supabaseSelectFilter(
      'receivable_transactions',
      `ref_type=eq.CreditApply&ref_id=in.(${chunk.join(',')})`,
      { select: 'ref_id,amount', limit: Math.max(chunk.length * 3, 100) }
    )) as CreditApplyRow[] | null
    for (const row of applyRows || []) {
      const cid = Number(row.ref_id || 0)
      if (!cid) continue
      appliedByCredit.set(
        cid,
        roundReceivableMoney((appliedByCredit.get(cid) || 0) + Math.abs(Number(row.amount) || 0))
      )
    }
  }

  const out: StoreCreditItem[] = []
  for (const row of scoped) {
    const id = Number(row.id || 0)
    if (!id) continue
    const gross = Math.max(0, Number(row.amount) || 0)
    const applied = appliedByCredit.get(id) || 0
    const remaining = roundReceivableMoney(gross - applied)
    if (remaining <= 0.009) continue
    out.push({
      id,
      transDate: String(row.trans_date || '').slice(0, 10),
      amount: gross,
      remaining,
      memo: row.memo ? String(row.memo) : undefined,
    })
  }
  return out
}

export async function sumStoreCreditAvailable(storeName: string): Promise<number> {
  const items = await loadStoreCreditItemsForStore(storeName)
  return roundReceivableMoney(items.reduce((sum, item) => sum + item.remaining, 0))
}

export async function consumeStoreCreditFifo(params: {
  storeName: string
  amount: number
  transDate: string
  memo: string
  bankTransactionId?: number
}): Promise<void> {
  const need = roundReceivableMoney(Math.max(0, Number(params.amount) || 0))
  if (need <= 0.009) return

  const items = await loadStoreCreditItemsForStore(params.storeName)
  let left = need
  for (const item of items) {
    if (left <= 0.009) break
    const take = roundReceivableMoney(Math.min(left, item.remaining))
    if (take <= 0.009) continue
    await supabaseInsert('receivable_transactions', {
      store_name: params.storeName,
      amount: -take,
      ref_type: 'CreditApply',
      ref_id: item.id,
      trans_date: params.transDate,
      memo: params.memo.slice(0, 240),
      receive_checked: false,
      bank_transaction_id: params.bankTransactionId ?? null,
    })
    left = roundReceivableMoney(left - take)
  }
  if (left > 0.01) {
    throw new Error(`매장 선수금 잔액이 부족합니다. (부족 ฿${left.toLocaleString()})`)
  }
}

export async function registerReceivableStoreCredit(params: {
  storeName: string
  amount: number
  transDate: string
  memo: string
}): Promise<{ id: number }> {
  const storeName = String(params.storeName || '').trim()
  const amount = roundReceivableMoney(Math.max(0, Number(params.amount) || 0))
  const transDate = String(params.transDate || '').slice(0, 10)
  const memo = String(params.memo || '').trim()
  if (!storeName || amount <= 0.009 || transDate.length !== 10) {
    throw new Error('매장·금액·일자가 필요합니다.')
  }
  if (!memo) throw new Error('선수금 등록 사유(หมายเหตุ)가 필요합니다.')

  const inserted = (await supabaseInsert('receivable_transactions', {
    store_name: storeName,
    amount,
    ref_type: 'StoreCredit',
    trans_date: transDate,
    memo: memo.slice(0, 240),
    receive_checked: false,
  })) as { id?: number }[] | { id?: number } | null

  const id = Array.isArray(inserted) ? Number(inserted[0]?.id || 0) : Number((inserted as { id?: number })?.id || 0)
  if (!id) throw new Error('선수금 등록에 실패했습니다.')
  return { id }
}
