import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isPosChannelSettlementMemo } from '@/lib/bank-import-deposit-category'

export const RECEIVABLE_ACCRUAL_REF_TYPES = ['Order', 'ForceOutbound', 'AccountingPO'] as const
export type ReceivableAccrualRefType = (typeof RECEIVABLE_ACCRUAL_REF_TYPES)[number]

export function isReceivableAccrualRefType(refType: string | undefined | null): refType is ReceivableAccrualRefType {
  return (RECEIVABLE_ACCRUAL_REF_TYPES as readonly string[]).includes(String(refType || ''))
}

export function roundReceivableMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** 미수 발생 행 대비 수금(Receive) 합계로 잔액 계산 */
export function computeReceivableOpenAmount(
  accrualAmount: number,
  receiveOffsets: { amount?: number }[]
): number {
  const gross = Math.max(0, Number(accrualAmount) || 0)
  const paid = (receiveOffsets || []).reduce(
    (sum, row) => sum + Math.abs(Number(row.amount) || 0),
    0
  )
  return Math.max(0, roundReceivableMoney(gross - paid))
}

export type BankReceivableLinkRow = {
  transType?: string
  category?: string
  storeName?: string | null
  memo?: string | null
  isReceivableLinked?: boolean
  isChannelSettled?: boolean
}

/** 통장 입금 — 출고·미수금(주문)과 연결 대상인지 */
export function bankDepositNeedsReceivableOrderLink(row: BankReceivableLinkRow): boolean {
  if (String(row.transType || '').toLowerCase() !== 'deposit') return false
  if (String(row.category || '').toLowerCase() !== 'receivable_receive') return false
  if (!String(row.storeName || '').trim()) return false
  if (row.isChannelSettled) return false
  if (isPosChannelSettlementMemo(row.memo)) return false
  return true
}

export function bankDepositReceivableLinked(row: BankReceivableLinkRow): boolean {
  return bankDepositNeedsReceivableOrderLink(row) && Boolean(row.isReceivableLinked)
}

export function bankDepositReceivableLinkPending(row: BankReceivableLinkRow): boolean {
  return bankDepositNeedsReceivableOrderLink(row) && !row.isReceivableLinked
}

export function receivableStoreMatchesBank(storeName: string, bankStoreName: string): boolean {
  const a = String(storeName || '').trim()
  const b = String(bankStoreName || '').trim()
  if (!a || !b) return false
  if (a === b) return true
  return storesMatchForGradeLookup(a, b)
}

export function sumOpenReceivablePickAmount(
  list: { id: number; remainingAmount: number }[],
  selectedIds: Iterable<number>
): number {
  const idSet = new Set(selectedIds)
  return roundReceivableMoney(
    list
      .filter((row) => idSet.has(Number(row.id)))
      .reduce((sum, row) => sum + Math.max(0, Number(row.remainingAmount) || 0), 0)
  )
}

export function receivablePickTotalMatchesBank(bankAmount: number, selectedTotal: number): boolean {
  return Math.abs(Math.abs(Number(bankAmount) || 0) - Math.abs(Number(selectedTotal) || 0)) <= 0.01
}
