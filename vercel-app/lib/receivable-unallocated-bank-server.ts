import 'server-only'

import { receivableStoreMatchesBank } from '@/lib/bank-receivable-link'
import {
  buildReceivableAccrualStoreIndex,
  resolveReceivableAttributedStore,
  type ReceivableTransactionRow,
} from '@/lib/receivable-ledger-scope'
import { isConsolidatedBankReceiveRow } from '@/lib/receivable-unallocated-bank'
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
