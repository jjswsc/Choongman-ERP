import { describe, expect, it } from 'vitest'
import {
  computeInboundBatchAmounts,
  formatStockLogDateBangkokYmd,
  parseInboundDateBangkokYmd,
} from './inbound-payable-amount'
import type { ItemTaxType } from './income-statement-item-vat'

const taxableOnly = new Map<string, ItemTaxType>([['A', 'taxable']])

describe('computeInboundBatchAmounts', () => {
  it('uses gross (net + 7% VAT) for taxable lines', () => {
    const r = computeInboundBatchAmounts(
      [{ code: 'A', qty: 1, unitCost: 248_400, dateYmd: '2026-06-15' }],
      taxableOnly
    )
    expect(r.netTotal).toBe(248_400)
    expect(r.grossTotal).toBe(265_788)
    expect(r.batchDateYmd).toBe('2026-06-15')
  })

  it('rounds line net to 3 decimal places', () => {
    const r = computeInboundBatchAmounts(
      [{ code: 'A', qty: 180, unitCost: 1267.333, dateYmd: '2026-06-15' }],
      taxableOnly
    )
    expect(r.netTotal).toBe(228_119.94)
  })

  it('picks latest line date as batch date', () => {
    const r = computeInboundBatchAmounts(
      [
        { code: 'A', qty: 1, unitCost: 100, dateYmd: '2026-06-06' },
        { code: 'A', qty: 1, unitCost: 200, dateYmd: '2026-06-22' },
      ],
      taxableOnly
    )
    expect(r.batchDateYmd).toBe('2026-06-22')
  })
})

describe('formatStockLogDateBangkokYmd', () => {
  it('formats UTC log to Bangkok calendar date', () => {
    expect(formatStockLogDateBangkokYmd('2026-06-21T17:00:00.000Z')).toBe('2026-06-22')
  })

  it('keeps plain YYYY-MM-DD', () => {
    expect(parseInboundDateBangkokYmd('2026-06-15')).toBe('2026-06-15')
  })
})
