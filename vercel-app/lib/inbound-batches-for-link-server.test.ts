import { describe, expect, it } from 'vitest'
import {
  buildInboundVendorOrFilter,
  inboundBatchRemainingAmount,
  sortInboundBatchesForLink,
  type InboundBatchLinkRow,
} from './inbound-batches-for-link-server'

describe('buildInboundVendorOrFilter', () => {
  it('builds vendor_code and vendor_name eq clauses', () => {
    const clause = buildInboundVendorOrFilter(['1016', 'Sawasdee Plastic'])
    expect(clause).toContain('vendor_code.eq.1016')
    expect(clause).toContain('vendor_name.eq.1016')
    expect(clause).toContain('vendor_name.eq.Sawasdee%20Plastic')
    expect(clause.startsWith('&or=(')).toBe(true)
  })

  it('encodes commas in vendor names for PostgREST', () => {
    const clause = buildInboundVendorOrFilter(['Sawaddee Plastic (Thailand) Co.,Ltd.'])
    expect(clause).toContain('Co.%2CLtd.')
    expect(clause).not.toMatch(/Co.,Ltd/)
  })

  it('dedupes case-insensitive values', () => {
    const clause = buildInboundVendorOrFilter(['1016', '1016'])
    expect(clause.match(/vendor_code\.eq\.1016/g)?.length).toBe(1)
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
