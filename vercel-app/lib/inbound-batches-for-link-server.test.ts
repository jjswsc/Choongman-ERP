import { describe, expect, it } from 'vitest'
import {
  buildInboundVendorOrFilter,
  inboundBatchRemainingAmount,
  sortInboundBatchesForLink,
  type InboundBatchLinkRow,
} from './inbound-batches-for-link-server'

describe('buildInboundVendorOrFilter', () => {
  it('builds vendor_code and vendor_name in clauses with quoted values', () => {
    const clause = buildInboundVendorOrFilter(['1016', 'Sawasdee Plastic'])
    expect(decodeURIComponent(clause)).toBe(
      '&or=(vendor_code.in.("1016","Sawasdee Plastic"),vendor_name.in.("1016","Sawasdee Plastic"))'
    )
  })

  it('quotes vendor names containing commas and parentheses (PGRST100 regression)', () => {
    const clause = buildInboundVendorOrFilter(['1021', 'C.A.P. Intertrade Co.,Ltd.', 'Sawaddee Plastic (Thailand) Co.,Ltd.'])
    const decoded = decodeURIComponent(clause)
    expect(decoded).toContain('"C.A.P. Intertrade Co.,Ltd."')
    expect(decoded).toContain('"Sawaddee Plastic (Thailand) Co.,Ltd."')
    expect(decoded).not.toMatch(/\.eq\./)
  })

  it('escapes double quotes inside values', () => {
    const decoded = decodeURIComponent(buildInboundVendorOrFilter(['A "B" Co']))
    expect(decoded).toContain('"A \\"B\\" Co"')
  })

  it('dedupes case-insensitive values', () => {
    const decoded = decodeURIComponent(buildInboundVendorOrFilter(['1016', '1016']))
    expect(decoded.match(/"1016"/g)?.length).toBe(2)
  })

  it('returns empty string when no values', () => {
    expect(buildInboundVendorOrFilter(['', '  '])).toBe('')
  })
})

describe('sortInboundBatchesForLink', () => {
  const rows: InboundBatchLinkRow[] = [
    { id: 1, batch_date: '2026-03-09', total_amount: 7383 },
    { id: 2, batch_date: '2026-06-01', total_amount: 1000 },
    { id: 3, batch_date: '2026-05-01', total_amount: 500 },
  ]

  it('puts batches with remaining balance before fully linked ones', () => {
    const linked = new Map<number, number>([
      [1, 7383],
      [2, 0],
      [3, 200],
    ])
    const sorted = sortInboundBatchesForLink(rows, linked)
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('orders fully unpaid by newest batch_date first', () => {
    const sorted = sortInboundBatchesForLink(rows, new Map())
    expect(sorted.map((r) => r.id)).toEqual([2, 3, 1])
  })
})

describe('inboundBatchRemainingAmount', () => {
  it('never returns negative remainder', () => {
    expect(inboundBatchRemainingAmount(100, 150)).toBe(0)
    expect(inboundBatchRemainingAmount(7383, 7383)).toBe(0)
    expect(inboundBatchRemainingAmount(7383, 1000)).toBe(6383)
  })
})
