import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

type ReceiveRow = {
  id?: number
  ref_id?: number | null
  bank_transaction_id?: number | null
}

type AccrualRow = {
  id?: number
}

/**
 * 당일 입금(수금) 처리 순서 — Receive 행 id 오름차순, 동일 미수(accrual)는 최초 1건만.
 * 통장 연결 전이면 당일 Order/ForceOutbound/AccountingPO accrual id 순으로 폴백.
 */
export async function resolveTaxInvoiceDepositSeq(
  accrualReceivableId: number,
  issueDate: string
): Promise<number> {
  const accrualId = Number(accrualReceivableId || 0)
  const date = String(issueDate || '').trim().slice(0, 10)
  if (!accrualId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 1

  const receives = (await supabaseSelectFilterAllPages(
    'receivable_transactions',
    `ref_type=eq.Receive&trans_date=eq.${date}&ref_id=not.is.null`,
    { select: 'id,ref_id,bank_transaction_id', order: 'id.asc', pageSize: 5000 }
  )) as ReceiveRow[]

  const orderedAccrualIds: number[] = []
  const seen = new Set<number>()
  for (const row of receives) {
    const refId = Number(row.ref_id || 0)
    if (!refId || seen.has(refId)) continue
    seen.add(refId)
    orderedAccrualIds.push(refId)
  }

  const idx = orderedAccrualIds.indexOf(accrualId)
  if (idx >= 0) return idx + 1

  return resolveAccrualFallbackSeq(accrualId, date)
}

async function resolveAccrualFallbackSeq(accrualId: number, date: string): Promise<number> {
  const accruals = (await supabaseSelectFilterAllPages(
    'receivable_transactions',
    `trans_date=eq.${date}&ref_type=in.(Order,ForceOutbound,AccountingPO)`,
    { select: 'id', order: 'id.asc', pageSize: 5000 }
  )) as AccrualRow[]

  const idx = accruals.findIndex((row) => Number(row.id) === accrualId)
  return idx >= 0 ? idx + 1 : 1
}
