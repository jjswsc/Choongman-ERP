import { describe, expect, it } from 'vitest'
import {
  allocateInboundHeaderDiscount,
  computeInboundBatchAmountsWithDiscount,
  parseInboundDiscountAmt,
} from '@/lib/inbound-discount'
import { buildItemTaxMapFromRows } from '@/lib/inbound-payable-amount'

describe('inbound header discount', () => {
  it('parses discount amount', () => {
    expect(parseInboundDiscountAmt('310')).toBe(310)
    expect(parseInboundDiscountAmt('310.00')).toBe(310)
    expect(parseInboundDiscountAmt('')).toBe(0)
    expect(parseInboundDiscountAmt(-5)).toBe(0)
  })

  it('allocates header discount so supply matches IV (2947.56 − 310)', () => {
    const lines = [
      { qty: 10, unitCost: 100 },
      { qty: 10, unitCost: 194.756 },
    ]
    const sumBefore = lines.reduce((s, l) => s + l.qty * l.unitCost, 0)
    expect(sumBefore).toBeCloseTo(2947.56, 2)
    const { appliedDiscount, lines: out } = allocateInboundHeaderDiscount(lines, 310)
    expect(appliedDiscount).toBe(310)
    const sumAfter = out.reduce((s, l) => s + l.lineNetAfter, 0)
    expect(sumAfter).toBeCloseTo(2637.56, 2)
    expect(out.every((l) => l.unitCostAfter >= 0)).toBe(true)
  })

  it('caps discount at supply total', () => {
    const { appliedDiscount, lines } = allocateInboundHeaderDiscount(
      [{ qty: 2, unitCost: 100 }],
      9999
    )
    expect(appliedDiscount).toBe(200)
    expect(lines[0].lineNetAfter).toBe(0)
    expect(lines[0].unitCostAfter).toBe(0)
  })

  it('recomputes VAT after discount on taxable items', () => {
    const tax = buildItemTaxMapFromRows([{ code: 'A', tax: 'taxable' }])
    const r = computeInboundBatchAmountsWithDiscount(
      [{ code: 'A', qty: 10, unitCost: 100, dateYmd: '2026-10-03' }],
      tax,
      100
    )
    expect(r.netBefore).toBe(1000)
    expect(r.discount).toBe(100)
    expect(r.net).toBe(900)
    expect(r.vat).toBe(63)
    expect(r.gross).toBe(963)
  })
})
