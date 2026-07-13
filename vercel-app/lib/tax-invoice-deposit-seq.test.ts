import { describe, expect, it } from 'vitest'

type ReceiveRow = { id?: number; ref_id?: number | null; bank_transaction_id?: number | null }
type AccrualRow = { id?: number }

function computeDepositSeqFromRows(
  receives: ReceiveRow[],
  accrualId: number,
  accruals: AccrualRow[]
): number {
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
  const fallbackIdx = accruals.findIndex((row) => Number(row.id) === accrualId)
  return fallbackIdx >= 0 ? fallbackIdx + 1 : 1
}

describe('tax invoice deposit seq', () => {
  it('orders by Receive id and dedupes accrual', () => {
    const receives: ReceiveRow[] = [
      { id: 10, ref_id: 100, bank_transaction_id: 501 },
      { id: 20, ref_id: 200, bank_transaction_id: 502 },
      { id: 25, ref_id: 100, bank_transaction_id: 503 },
      { id: 30, ref_id: 300, bank_transaction_id: 504 },
    ]
    expect(computeDepositSeqFromRows(receives, 200, [])).toBe(2)
    expect(computeDepositSeqFromRows(receives, 300, [])).toBe(3)
  })

  it('falls back to accrual id order when no receive yet', () => {
    const accruals: AccrualRow[] = [{ id: 11 }, { id: 22 }, { id: 33 }]
    expect(computeDepositSeqFromRows([], 22, accruals)).toBe(2)
  })
})
