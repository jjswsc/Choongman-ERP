import {
  receivableStoreMatchesBank,
  remainingBankSurplusAfterApplies,
  roundReceivableMoney,
} from '@/lib/bank-receivable-link'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장 과납 선수금 Receive 적요 — 미배정 입금과 구분 */
export const BANK_SURPLUS_CREDIT_MEMO_PREFIX = '과납 선수금'

export function isBankSurplusCreditMemo(memo: string | undefined | null): boolean {
  return String(memo || '').trim().startsWith(BANK_SURPLUS_CREDIT_MEMO_PREFIX)
}

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

export type BankSurplusCreditItem = {
  id: number
  bankTransactionId: number
  transDate: string
  amount: number
  remaining: number
}

type SurplusReceiveRow = {
  id?: number
  store_name?: string
  amount?: number
  trans_date?: string
  memo?: string
  bank_transaction_id?: number | null
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

async function loadCreditApplyAbsByRefId(creditIds: number[]): Promise<Map<number, number>> {
  const appliedByCredit = new Map<number, number>()
  for (let i = 0; i < creditIds.length; i += 80) {
    const chunk = creditIds.slice(i, i + 80)
    if (chunk.length === 0) continue
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
  return appliedByCredit
}

function toBankSurplusCreditItem(
  row: SurplusReceiveRow,
  appliedByCredit: Map<number, number>
): BankSurplusCreditItem | null {
  if (!isBankSurplusCreditMemo(row.memo)) return null
  const id = Number(row.id || 0)
  const bankTransactionId = Number(row.bank_transaction_id || 0)
  if (!id || !bankTransactionId) return null
  const amount = roundReceivableMoney(Math.abs(Number(row.amount) || 0))
  const remaining = remainingBankSurplusAfterApplies(Number(row.amount) || 0, [
    appliedByCredit.get(id) || 0,
  ])
  return {
    id,
    bankTransactionId,
    transDate: String(row.trans_date || '').slice(0, 10),
    amount,
    remaining,
  }
}

export async function loadBankSurplusCreditItemsForStore(
  storeName: string
): Promise<BankSurplusCreditItem[]> {
  const store = String(storeName || '').trim()
  if (!store) return []

  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Receive&ref_id=is.null&amount=lt.0`,
    {
      select: 'id,store_name,amount,trans_date,memo,bank_transaction_id',
      order: 'trans_date.asc,id.asc',
      limit: 500,
    }
  )) as SurplusReceiveRow[] | null

  const scoped = (rows || []).filter(
    (row) =>
      isBankSurplusCreditMemo(row.memo) &&
      receivableStoreMatchesBank(String(row.store_name || ''), store)
  )
  const appliedByCredit = await loadCreditApplyAbsByRefId(
    scoped.map((row) => Number(row.id || 0)).filter((id) => id > 0)
  )

  const out: BankSurplusCreditItem[] = []
  for (const row of scoped) {
    const item = toBankSurplusCreditItem(row, appliedByCredit)
    if (!item || item.remaining <= 0.009) continue
    out.push(item)
  }
  return out
}

export async function sumBankSurplusCreditAvailable(storeName: string): Promise<number> {
  const items = await loadBankSurplusCreditItemsForStore(storeName)
  return roundReceivableMoney(items.reduce((sum, item) => sum + item.remaining, 0))
}

export async function loadBankSurplusCreditForBankTx(
  bankTransactionId: number
): Promise<BankSurplusCreditItem[]> {
  const bankId = Number(bankTransactionId || 0)
  if (!bankId) return []
  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    `bank_transaction_id=eq.${bankId}&ref_type=eq.Receive&ref_id=is.null`,
    {
      select: 'id,store_name,amount,trans_date,memo,bank_transaction_id',
      limit: 20,
    }
  )) as SurplusReceiveRow[] | null
  const scoped = (rows || []).filter((row) => isBankSurplusCreditMemo(row.memo))
  const appliedByCredit = await loadCreditApplyAbsByRefId(
    scoped.map((row) => Number(row.id || 0)).filter((id) => id > 0)
  )
  return scoped
    .map((row) => toBankSurplusCreditItem(row, appliedByCredit))
    .filter((item): item is BankSurplusCreditItem => Boolean(item && item.id > 0))
}

export async function insertBankSurplusCredit(params: {
  storeName: string
  amount: number
  transDate: string
  bankTransactionId: number
}): Promise<{ id: number }> {
  const storeName = String(params.storeName || '').trim()
  const amount = roundReceivableMoney(Math.max(0, Number(params.amount) || 0))
  const transDate = String(params.transDate || '').slice(0, 10)
  const bankTransactionId = Number(params.bankTransactionId || 0)
  if (!storeName || amount <= 0.009 || transDate.length !== 10 || !bankTransactionId) {
    throw new Error('매장·금액·일자·통장 거래가 필요합니다.')
  }

  const inserted = (await supabaseInsert('receivable_transactions', {
    store_name: storeName,
    amount: -amount,
    ref_type: 'Receive',
    ref_id: null,
    trans_date: transDate,
    memo: `${BANK_SURPLUS_CREDIT_MEMO_PREFIX} ฿${amount.toLocaleString()} (다음 입금 상계)`.slice(0, 240),
    receive_checked: false,
    bank_transaction_id: bankTransactionId,
  })) as { id?: number }[] | { id?: number } | null

  const id = Array.isArray(inserted) ? Number(inserted[0]?.id || 0) : Number((inserted as { id?: number })?.id || 0)
  if (!id) throw new Error('과납 선수금 적립에 실패했습니다.')
  return { id }
}

async function consumeBankSurplusCreditFifo(params: {
  storeName: string
  amount: number
  transDate: string
  memo: string
  bankTransactionId?: number
}): Promise<number> {
  const need = roundReceivableMoney(Math.max(0, Number(params.amount) || 0))
  if (need <= 0.009) return 0

  const items = await loadBankSurplusCreditItemsForStore(params.storeName)
  let left = need
  let took = 0
  for (const item of items) {
    if (left <= 0.009) break
    const take = roundReceivableMoney(Math.min(left, item.remaining))
    if (take <= 0.009) continue
    await supabaseInsert('receivable_transactions', {
      store_name: params.storeName,
      amount: take,
      ref_type: 'CreditApply',
      ref_id: item.id,
      trans_date: params.transDate,
      memo: params.memo.slice(0, 240),
      receive_checked: false,
      bank_transaction_id: params.bankTransactionId ?? null,
    })
    left = roundReceivableMoney(left - take)
    took = roundReceivableMoney(took + take)
  }
  return took
}

export async function restoreBankSurplusCreditFromApplies(
  _applyRows: { ref_id?: number; amount?: number }[]
): Promise<void> {
  // 과납 원본 Receive는 불변. 사용분은 +CreditApply 이며 unlink 시 그 행을 지우면 가용액이 복원된다.
}

export async function sumStoreCreditAvailable(storeName: string): Promise<number> {
  const items = await loadStoreCreditItemsForStore(storeName)
  const leftover = await sumBankSurplusCreditAvailable(storeName)
  return roundReceivableMoney(
    items.reduce((sum, item) => sum + item.remaining, 0) + leftover
  )
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

  const leftoverTook = await consumeBankSurplusCreditFifo(params)
  let left = roundReceivableMoney(need - leftoverTook)
  if (left <= 0.009) return

  const items = await loadStoreCreditItemsForStore(params.storeName)
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
