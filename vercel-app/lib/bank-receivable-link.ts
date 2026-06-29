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

export type ReceivableLinkAllocationPart = {
  accrualId: number
  remaining: number
  fromBank: number
  fromCredit: number
  fromRounding: number
}

/** 통장·선수금·반올림으로 인보이스별 수금액 배분 */
export function buildReceivableLinkAllocations(params: {
  bankAmt: number
  storeCreditApply: number
  targets: { accrualId: number; remaining: number }[]
  absorbShortfall: boolean
}): ReceivableLinkAllocationPart[] {
  const targets = params.targets || []
  if (targets.length === 0) return []

  let bankPool = roundReceivableMoney(Math.max(0, Number(params.bankAmt) || 0))
  let creditPool = roundReceivableMoney(Math.max(0, Number(params.storeCreditApply) || 0))
  const out: ReceivableLinkAllocationPart[] = []

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!
    const isLast = i === targets.length - 1
    let left = roundReceivableMoney(Math.max(0, Number(t.remaining) || 0))

    const fromBank = roundReceivableMoney(Math.min(left, bankPool))
    bankPool = roundReceivableMoney(bankPool - fromBank)
    left = roundReceivableMoney(left - fromBank)

    const fromCredit = roundReceivableMoney(Math.min(left, creditPool))
    creditPool = roundReceivableMoney(creditPool - fromCredit)
    left = roundReceivableMoney(left - fromCredit)

    let fromRounding = 0
    if (left > 0.009) {
      if (isLast && params.absorbShortfall) {
        fromRounding = left
      }
    }

    out.push({
      accrualId: t.accrualId,
      remaining: roundReceivableMoney(Math.max(0, Number(t.remaining) || 0)),
      fromBank,
      fromCredit,
      fromRounding,
    })
  }

  return out
}

export function sumReceivableLinkAllocation(parts: ReceivableLinkAllocationPart[]): {
  fromBank: number
  fromCredit: number
  fromRounding: number
  total: number
} {
  let fromBank = 0
  let fromCredit = 0
  let fromRounding = 0
  for (const p of parts) {
    fromBank = roundReceivableMoney(fromBank + p.fromBank)
    fromCredit = roundReceivableMoney(fromCredit + p.fromCredit)
    fromRounding = roundReceivableMoney(fromRounding + p.fromRounding)
  }
  return {
    fromBank,
    fromCredit,
    fromRounding,
    total: roundReceivableMoney(fromBank + fromCredit + fromRounding),
  }
}

export function canSaveReceivablePickWithMismatch(params: {
  bankAmt: number
  selectedTotal: number
  storeCreditApply: number
  mismatchNote: string
  mismatchReason: string
  canApproveMismatch: boolean
}): boolean {
  const gap = roundReceivableMoney(
    params.selectedTotal - params.bankAmt - params.storeCreditApply
  )
  if (Math.abs(gap) <= 0.01) return true
  if (gap < -0.01) {
    if (Math.abs(gap) <= 1) return Boolean(String(params.mismatchReason || '').trim())
    return Boolean(String(params.mismatchNote || '').trim())
  }
  if (Math.abs(gap) <= 1) return Boolean(String(params.mismatchReason || '').trim())
  if (!params.canApproveMismatch) return false
  return Boolean(String(params.mismatchNote || '').trim())
}
