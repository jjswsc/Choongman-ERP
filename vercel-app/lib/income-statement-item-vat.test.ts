import { describe, expect, it } from 'vitest'
import {
  accumulateNetByItemTax,
  emptyNetVatBuckets,
  grossFromNetVatBuckets,
  netTotalFromBuckets,
  normalizeItemTaxType,
  stockNetLineGrossAmount,
  sumInventoryQtyCostBuckets,
} from '@/lib/income-statement-item-vat'

const taxMap = new Map([
  ['A', 'taxable' as const],
  ['B', 'exempt' as const],
])

describe('income-statement-item-vat', () => {
  it('normalizeItemTaxType', () => {
    expect(normalizeItemTaxType('면세')).toBe('exempt')
    expect(normalizeItemTaxType('taxable')).toBe('taxable')
  })

  it('grossFromNetVatBuckets taxes only taxable lines', () => {
    const b = emptyNetVatBuckets()
    accumulateNetByItemTax(b, 'A', 100, taxMap)
    accumulateNetByItemTax(b, 'B', 50, taxMap)
    expect(grossFromNetVatBuckets(b)).toBe(157)
  })

  it('inventory total rounds once, including negative qty, like the stock screen', () => {
    const buckets = sumInventoryQtyCostBuckets(
      { A: 1, B: 1, C: 1 },
      { A: 1.004, B: 1.004, C: -0.02 },
      taxMap
    )
    // 1.004+1.004-0.02 = 1.988 → 1.99. 줄마다 반올림하고 음수를 버리면 1.00+1.00 = 2.00
    expect(netTotalFromBuckets(buckets)).toBe(1.99)
    expect(buckets.exemptNet).toBe(1.004)
  })

  it('stockNetLineGrossAmount scales by parent ratio', () => {
    const parent = emptyNetVatBuckets()
    accumulateNetByItemTax(parent, 'A', 100, taxMap)
    accumulateNetByItemTax(parent, 'B', 100, taxMap)
    expect(stockNetLineGrossAmount(100, parent)).toBe(103.5)
  })
})
