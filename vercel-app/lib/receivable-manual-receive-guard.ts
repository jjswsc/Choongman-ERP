import { receivableStoreMatchesBank } from '@/lib/bank-receivable-link'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type ConsolidatedBankReceiveConflict = {
  receiveId: number
  bankTransactionId: number
  amountAbs: number
  transDate: string
}

/** 통장 통합 수금( ref_id null )이 있으면 미수금 화면 수금확인(수동) 차단 */
export async function findConsolidatedBankReceiveBlockingManualCheck(
  storeName: string,
  receiveDate: string
): Promise<ConsolidatedBankReceiveConflict | null> {
  const date = String(receiveDate || '').slice(0, 10)
  const store = String(storeName || '').trim()
  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Receive&ref_id=is.null&bank_transaction_id=not.is.null&trans_date=eq.${date}`,
    {
      select: 'id,bank_transaction_id,amount,store_name,memo',
      limit: 100,
    }
  )) as {
    id?: number
    bank_transaction_id?: number | null
    amount?: number
    store_name?: string
    memo?: string | null
  }[] | null

  for (const row of rows || []) {
    const memo = String(row.memo || '').trim()
    if (!memo.startsWith('통장')) continue
    if (!receivableStoreMatchesBank(String(row.store_name || ''), store)) continue
    const receiveId = Number(row.id || 0)
    const bankTransactionId = Number(row.bank_transaction_id || 0)
    if (!receiveId || !bankTransactionId) continue
    return {
      receiveId,
      bankTransactionId,
      amountAbs: Math.abs(Number(row.amount) || 0),
      transDate: date,
    }
  }
  return null
}
