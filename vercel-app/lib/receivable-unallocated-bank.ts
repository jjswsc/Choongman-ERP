import {
  resolveReceivableAttributedStore,
  type ReceivableAttributionMaps,
  type ReceivableTransactionRow,
} from '@/lib/receivable-ledger-pure'
import { receivableStoreGroupKey } from '@/lib/receivable-store-key'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** 통장 매출 수령 통합 수금 — 인보이스(ref_id) 미배분 */
export function isConsolidatedBankReceiveRow(r: ReceivableTransactionRow): boolean {
  if (String(r.ref_type || '') !== 'Receive') return false
  const refId = r.ref_id
  if (refId != null && Number(refId) > 0) return false
  const bankId = Number(r.bank_transaction_id || 0)
  if (!bankId) return false
  const memo = String(r.memo || '').trim()
  return memo.startsWith('통장')
}

export type UnallocatedBankReceiveItem = {
  bankTransactionId: number
  transDate: string
  amountAbs: number
  memo?: string
}

export function listUnallocatedBankReceives(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps,
  storeGroupKey?: string
): UnallocatedBankReceiveItem[] {
  const out: UnallocatedBankReceiveItem[] = []
  for (const r of rows) {
    if (!isConsolidatedBankReceiveRow(r)) continue
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!sn) continue
    const gk = receivableStoreGroupKey(sn)
    if (storeGroupKey && gk !== storeGroupKey) continue
    const bankTransactionId = Number(r.bank_transaction_id || 0)
    if (!bankTransactionId) continue
    out.push({
      bankTransactionId,
      transDate: String(r.trans_date || '').slice(0, 10),
      amountAbs: roundMoney(Math.abs(Number(r.amount ?? 0))),
      memo: r.memo ? String(r.memo) : undefined,
    })
  }
  out.sort((a, b) => b.transDate.localeCompare(a.transDate) || b.bankTransactionId - a.bankTransactionId)
  return out
}

export function sumUnallocatedBankReceiveByStoreGroup(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps
): Record<string, number> {
  const byGroup: Record<string, number> = {}
  for (const item of listUnallocatedBankReceives(rows, attributionMaps)) {
    const row = rows.find(
      (r) => Number(r.bank_transaction_id || 0) === item.bankTransactionId && isConsolidatedBankReceiveRow(r)
    )
    if (!row) continue
    const sn = resolveReceivableAttributedStore(row, attributionMaps)
    if (!sn) continue
    const groupKey = receivableStoreGroupKey(sn)
    byGroup[groupKey] = roundMoney((byGroup[groupKey] || 0) + item.amountAbs)
  }
  return byGroup
}

export function sumUnallocatedBankReceiveForStoreName(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps,
  storeName: string
): number {
  const groupKey = receivableStoreGroupKey(storeName)
  const byGroup = sumUnallocatedBankReceiveByStoreGroup(rows, attributionMaps)
  return byGroup[groupKey] || 0
}

/** 미수금 화면 수동 수금확인 가능 여부 (통장 연동·미할당 입금 정책) */
export function canManuallyToggleReceivableReceiveCheck(params: {
  receiveChecked: boolean
  linkedBankTransactionId: number
  unallocatedBankReceiveTotal: number
}): { allowed: boolean; reason?: 'bank_linked' | 'unallocated_bank' } {
  if (params.linkedBankTransactionId > 0) {
    return { allowed: false, reason: 'bank_linked' }
  }
  if (!params.receiveChecked && (params.unallocatedBankReceiveTotal || 0) > 0.009) {
    return { allowed: false, reason: 'unallocated_bank' }
  }
  return { allowed: true }
}
