import { describe, expect, it } from 'vitest'
import {
  partitionPurchaseVendorMapByHqCodes,
  shouldSkipStoreInboundForHqPurchase,
} from './accounting-reports-purchase-hq-dedupe'

describe('shouldSkipStoreInboundForHqPurchase', () => {
  it('skips From HQ when store uses outbound aggregate', () => {
    expect(shouldSkipStoreInboundForHqPurchase('From HQ', 'REF-1', true)).toBe(true)
    expect(shouldSkipStoreInboundForHqPurchase('From HQ', '', true)).toBe(true)
  })

  it('keeps legacy skip for From HQ without reference when not in store mode', () => {
    expect(shouldSkipStoreInboundForHqPurchase('From HQ', '', false)).toBe(true)
    expect(shouldSkipStoreInboundForHqPurchase('From HQ', 'REF-1', false)).toBe(false)
  })

  it('does not skip external vendors', () => {
    expect(shouldSkipStoreInboundForHqPurchase('VENDOR-A', '', true)).toBe(false)
  })
})

describe('partitionPurchaseVendorMapByHqCodes', () => {
  it('splits HQ vendor codes from purchase map', () => {
    const hq = new Set(['sj-global'])
    const { kept, excluded } = partitionPurchaseVendorMapByHqCodes(
      { 'sj-global': 390_075, polar: 72_278 },
      hq
    )
    expect(kept).toEqual({ polar: 72_278 })
    expect(excluded).toEqual([{ key: 'sj-global', amount: 390_075 }])
  })
})
