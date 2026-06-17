import { ensureErpStoreMatchIndex, storeMatchesIncomeFilterWithIndex } from '@/lib/accounting-store-match'
import { storeHasPosCompletedOrders } from '@/lib/bank-settlement-guards'
import { shouldCreateFranchiseReceivableSubledgerFromBankReceive } from '@/lib/franchise-receivable-subledger-gate'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

export type ReceivableBankSubledgerGap = {
  bankId: number
  transDate: string
  amount: number
  storeName: string
  memo: string | null
  /** POS 완료 주문이 있는 매장 — CM Bangna 유형 */
  isPosStore: boolean
}

const posStoreCache = new Map<string, boolean>()

async function cachedStoreHasPosCompletedOrders(storeName: string): Promise<boolean> {
  const key = String(storeName || '').trim().toLowerCase()
  if (!key) return false
  const hit = posStoreCache.get(key)
  if (hit !== undefined) return hit
  const v = await storeHasPosCompletedOrders(storeName)
  posStoreCache.set(key, v)
  return v
}

/** 통장 receivable_receive 중 미수금 Receive 보조원장이 있어야 하는데 없는 건 */
export async function findReceivableBankSubledgerGaps(params: {
  endStr: string
  startStr?: string
  storeFilter?: string
  limit?: number
}): Promise<ReceivableBankSubledgerGap[]> {
  const endStr = String(params.endStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return []

  const startStr = params.startStr ? String(params.startStr).slice(0, 10) : undefined
  const storeFilter = String(params.storeFilter || 'All').trim() || 'All'
  const maxRows = Math.min(Math.max(Number(params.limit) || 2000, 1), 5000)

  let bankFilter = `trans_date=lte.${encodeURIComponent(endStr)}&trans_type=eq.deposit&category=eq.receivable_receive&store_name=not.is.null`
  if (startStr && /^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
    bankFilter += `&trans_date=gte.${encodeURIComponent(startStr)}`
  }

  const bankRows = (await supabaseSelectFilterAllPages('bank_transactions', bankFilter, {
    select: 'id,trans_date,amount,store_name,store,memo',
    order: 'trans_date.desc',
    pageSize: 500,
    maxRows,
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    store_name?: string | null
    store?: string | null
    memo?: string | null
  }[]

  const storeIndex =
    storeFilter.toLowerCase() !== 'all' ? await ensureErpStoreMatchIndex() : null

  const candidates = (bankRows || []).filter((r) => {
    const storeName = String(r.store_name || r.store || '').trim()
    if (!storeName) return false
    if (storeIndex) {
      return storeMatchesIncomeFilterWithIndex(storeName, storeFilter, storeIndex)
    }
    return true
  })

  const bankIds = candidates.map((r) => Number(r.id || 0)).filter((id) => id > 0)
  if (bankIds.length === 0) return []

  const haveReceive = new Set<number>()
  const settlementLinked = new Set<number>()

  for (let i = 0; i < bankIds.length; i += 80) {
    const chunk = bankIds.slice(i, i + 80)
    const idList = chunk.join(',')
    const [recvRows, settleRows] = await Promise.all([
      supabaseSelectFilter('receivable_transactions', `bank_transaction_id=in.(${idList})&ref_type=eq.Receive`, {
        select: 'bank_transaction_id',
        limit: Math.max(chunk.length, 100),
      }) as Promise<{ bank_transaction_id?: number }[] | null>,
      supabaseSelectFilter('pos_channel_settlements', `bank_transaction_id=in.(${idList})`, {
        select: 'bank_transaction_id',
        limit: chunk.length,
      }) as Promise<{ bank_transaction_id?: number }[] | null>,
    ])
    for (const row of recvRows || []) {
      const id = Number(row.bank_transaction_id || 0)
      if (id > 0) haveReceive.add(id)
    }
    for (const row of settleRows || []) {
      const id = Number(row.bank_transaction_id || 0)
      if (id > 0) settlementLinked.add(id)
    }
  }

  const gaps: ReceivableBankSubledgerGap[] = []

  for (const r of candidates) {
    const bankId = Number(r.id || 0)
    if (bankId <= 0 || haveReceive.has(bankId)) continue

    const storeName = String(r.store_name || r.store || '').trim()
    const memo = r.memo != null ? String(r.memo) : null
    const linkedToChannelSettlement = settlementLinked.has(bankId)
    const hasPosCompletedOrders = await cachedStoreHasPosCompletedOrders(storeName)

    const shouldHave = shouldCreateFranchiseReceivableSubledgerFromBankReceive({
      linkedToChannelSettlement,
      hasPosCompletedOrders,
      memo,
    })
    if (!shouldHave) continue

    gaps.push({
      bankId,
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      storeName,
      memo,
      isPosStore: hasPosCompletedOrders,
    })
  }

  return gaps.sort((a, b) => b.transDate.localeCompare(a.transDate) || b.bankId - a.bankId)
}
