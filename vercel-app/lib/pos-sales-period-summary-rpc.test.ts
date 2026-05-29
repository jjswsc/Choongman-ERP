import { describe, expect, it } from 'vitest'
import {
  canUsePosSalesPeriodSummaryRpc,
  normalizePosSalesPeriodSummaryRow,
} from '@/lib/pos-sales-period-summary-rpc'

describe('pos-sales-period-summary-rpc', () => {
  it('allows RPC only for single business day and single store', () => {
    expect(
      canUsePosSalesPeriodSummaryRpc({
        startStr: '2026-05-01',
        endStr: '2026-05-01',
        storeCode: 'CM Silom',
      })
    ).toBe(true)
    expect(
      canUsePosSalesPeriodSummaryRpc({
        startStr: '2026-05-01',
        endStr: '2026-05-02',
        storeCode: 'CM Silom',
      })
    ).toBe(false)
    expect(
      canUsePosSalesPeriodSummaryRpc({
        startStr: '2026-05-01',
        endStr: '2026-05-01',
        storeCode: 'All',
      })
    ).toBe(false)
  })

  it('normalizes RPC row fields', () => {
    expect(
      normalizePosSalesPeriodSummaryRow({
        completed_count: '3',
        completed_total: '1500.5',
        completed_cash: 200,
        pending_count: 1,
      })
    ).toEqual({
      completedCount: 3,
      completedTotal: 1500.5,
      completedCash: 200,
      pendingCount: 1,
    })
  })
})
