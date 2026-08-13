import 'server-only'

import { receivableStoreMatchesBank } from '@/lib/bank-receivable-link'
import {
  buildReceivableAccrualStoreIndex,
  resolveReceivableAttributedStore,
  type ReceivableTransactionRow,
} from '@/lib/receivable-ledger-pure'
import {
  isConsolidatedBankReceiveRow,
  type BankTxAccountMeta,
} from '@/lib/receivable-unallocated-bank'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** DB 조회 — 매장 미할당 통장 입금 합계 */
export async function fetchUnallocatedBankReceiveTotalForStore(storeName: string): Promise<number> {
  const store = String(storeName || '').trim()
  if (!store) return 0
  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    'ref_type=eq.Receive&ref_id=is.null&bank_transaction_id=not.is.null',
    {
      select: 'id,store_name,amount,ref_type,ref_id,trans_date,memo,bank_transaction_id',
      limit: 5000,
    }
  )) as ReceivableTransactionRow[] | null
  const attributionMaps = buildReceivableAccrualStoreIndex(rows || [])
  let total = 0
  for (const r of rows || []) {
    if (!isConsolidatedBankReceiveRow(r)) continue
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!receivableStoreMatchesBank(sn, store)) continue
    total = roundMoney(total + Math.abs(Number(r.amount ?? 0)))
  }
  return total
}

const BANK_TX_META_CHUNK = 200

/** 통장 거래 ID → 실제 계좌(다른 매장 통장으로 열리지 않게) */
export async function fetchBankAccountMetaByTransactionIds(
  ids: number[]
): Promise<Record<number, BankTxAccountMeta>> {
  const unique = [...new Set(ids.map((n) => Number(n)).filter((n) => n > 0))]
  if (unique.length === 0) return {}
  const out: Record<number, BankTxAccountMeta> = {}
  for (let i = 0; i < unique.length; i += BANK_TX_META_CHUNK) {
    const chunk = unique.slice(i, i + BANK_TX_META_CHUNK)
    const rows = (await supabaseSelectFilter('bank_transactions', `id=in.(${chunk.join(',')})`, {
      select: 'id,account_id',
      limit: chunk.length,
    })) as { id?: number; account_id?: number }[] | null
    const accountIds = [
      ...new Set((rows || []).map((r) => Number(r.account_id)).filter((n) => n > 0)),
    ]
    const accounts =
      accountIds.length > 0
        ? ((await supabaseSelectFilter('bank_accounts', `id=in.(${accountIds.join(',')})`, {
            select: 'id,name,store',
            limit: accountIds.length,
          })) as { id?: number; name?: string; store?: string }[] | null)
        : []
    const accById = new Map<number, { name?: string; store?: string }>()
    for (const a of accounts || []) {
      const id = Number(a.id)
      if (id > 0) accById.set(id, { name: a.name, store: a.store })
    }
    for (const r of rows || []) {
      const txId = Number(r.id)
      const accountId = Number(r.account_id)
      if (txId <= 0 || accountId <= 0) continue
      const acc = accById.get(accountId)
      out[txId] = {
        accountId,
        accountName: acc?.name ? String(acc.name).trim() || undefined : undefined,
        accountStore: acc?.store ? String(acc.store).trim() || undefined : undefined,
      }
    }
  }
  return out
}
