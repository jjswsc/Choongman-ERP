import { describe, expect, it } from 'vitest'
import { parseHqDailyMatrixDateRange } from '@/lib/hq-warehouse-daily-stock-matrix'
import { applyMatrixViewMode, pctChange } from '@/lib/hq-warehouse-daily-stock-matrix-view'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'

describe('parseHqDailyMatrixDateRange', () => {
  it('normalizes reversed dates', () => {
    expect(parseHqDailyMatrixDateRange('2026-04-30', '2026-04-01')).toEqual({
      startStr: '2026-04-01',
      endStr: '2026-04-30',
    })
  })

  it('rejects invalid', () => {
    expect(parseHqDailyMatrixDateRange('', '2026-04-01')).toBeNull()
  })
})

describe('applyMatrixViewMode daily_total', () => {
  it('merges out columns per day', () => {
    const columns = [
      { key: 'out|2026-04-01|A', ymd: '2026-04-01', kind: 'out' as const, store: 'A', label: 'OUT A' },
      { key: 'out|2026-04-01|B', ymd: '2026-04-01', kind: 'out' as const, store: 'B', label: 'OUT B' },
    ]
    const items = [
      {
        code: 'CM001',
        name: 'x',
        spec: '-',
        unit: 'ea',
        cost: 0,
        price: 0,
        category: '',
        cells: { 'out|2026-04-01|A': 2, 'out|2026-04-01|B': 3 },
        beginning: 0,
        balance: 0,
        minQty: 0,
        totalIn: 0,
        totalOut: 5,
        avgOutPerDay: 0,
        avgOutPerWeek: 0,
        avgOutPerMonth: 0,
        orderPeriodDays: null,
        costOfGoods: 0,
        valuationUnitCost: 0,
        priorTotalOut: 0,
        outChangePct: null,
        sparkline: [],
      },
    ]
    const r = applyMatrixViewMode(columns, items, 'daily_total')
    expect(r.columns.some((c) => c.key === 'out_sum|2026-04-01')).toBe(true)
    expect(r.items[0].cells['out_sum|2026-04-01']).toBe(5)
  })
})

describe('pctChange', () => {
  it('computes percent', () => {
    expect(pctChange(110, 100)).toBe(10)
  })
})

describe('invoice VAT totals for day invoice row', () => {
  it('rounds Thai VAT on grouped subtotal', () => {
    const t = thaiInvoiceTotalsFromRawSubtotal(1000)
    expect(t.grandTotal).toBe(1070)
  })
})
