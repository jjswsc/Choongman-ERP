import { describe, expect, it } from 'vitest'
import {
  accumulateNetByItemTax,
  emptyNetVatBuckets,
  grossFromNetVatBuckets,
  normalizeItemTaxType,
  stockNetLineGrossAmount,
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

  it('stockNetLineGrossAmount scales by parent ratio', () => {
    const parent = emptyNetVatBuckets()
    accumulateNetByItemTax(parent, 'A', 100, taxMap)
    accumulateNetByItemTax(parent, 'B', 100, taxMap)
    expect(stockNetLineGrossAmount(100, parent)).toBe(103.5)
  })
})
