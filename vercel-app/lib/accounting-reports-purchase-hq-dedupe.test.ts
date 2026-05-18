import { describe, expect, it } from 'vitest'
import {
  buildHqVendorMatchIndex,
  isHqVendorPurchaseKey,
  partitionPurchaseVendorMapByHqCodes,
  shouldSkipStoreInboundForHqPurchase,
  vendorRowIsHeadOffice,
} from './accounting-reports-purchase-hq-dedupe'

describe('vendorRowIsHeadOffice', () => {
  it('matches code HQ and type variants', () => {
    expect(vendorRowIsHeadOffice({ code: 'HQ', type: 'purchase' })).toBe(true)
    expect(vendorRowIsHeadOffice({ code: 'V1', type: '본사' })).toBe(true)
    expect(vendorRowIsHeadOffice({ code: 'V2', type: 'Head Office' })).toBe(true)
  })

  it('matches legal name with (Head Office) even when type was overwritten', () => {
    expect(
      vendorRowIsHeadOffice({
        code: 'SJG',
        type: 'purchase',
        name: 'S&J Global Co., Ltd (Head Office)',
      })
    ).toBe(true)
  })

  it('does not match ordinary vendors', () => {
    expect(vendorRowIsHeadOffice({ code: 'POLAR', type: 'purchase', name: 'Polar Bear Mission Co., Ltd.' })).toBe(
      false
    )
  })
})

describe('isHqVendorPurchaseKey', () => {
  const index = buildHqVendorMatchIndex([
    { code: 'SJG', type: 'purchase', name: 'S&J Global Co., Ltd (Head Office)' },
  ])

  it('matches vendor code and full name from stock_logs', () => {
    expect(isHqVendorPurchaseKey('SJG', index)).toBe(true)
    expect(isHqVendorPurchaseKey('S&J Global Co., Ltd (Head Office)', index)).toBe(true)
    expect(isHqVendorPurchaseKey('s&j global co., ltd (head office)', index)).toBe(true)
  })

  it('matches From HQ and inline (Head Office) label without master row', () => {
    const empty = buildHqVendorMatchIndex([])
    expect(isHqVendorPurchaseKey('From HQ', empty)).toBe(true)
    expect(isHqVendorPurchaseKey('Some Vendor (Head Office)', empty)).toBe(true)
  })
})

describe('shouldSkipStoreInboundForHqPurchase', () => {
  const index = buildHqVendorMatchIndex([{ code: 'SJG', name: 'S&J Global Co., Ltd (Head Office)', type: '본사' }])

  it('skips From HQ and HQ vendor name when store uses outbound aggregate', () => {
    expect(shouldSkipStoreInboundForHqPurchase('From HQ', 'REF-1', true, index)).toBe(true)
    expect(shouldSkipStoreInboundForHqPurchase('S&J Global Co., Ltd (Head Office)', '', true, index)).toBe(true)
  })
})

describe('partitionPurchaseVendorMapByHqCodes', () => {
  it('splits HQ vendor keys from purchase map', () => {
    const index = buildHqVendorMatchIndex([{ code: 'sj-global', type: '본사', name: 'S&J Global' }])
    const { kept, excluded } = partitionPurchaseVendorMapByHqCodes(
      { 'sj-global': 390_075, polar: 72_278, 'S&J Global Co., Ltd (Head Office)': 8_800 },
      index
    )
    expect(kept).toEqual({ polar: 72_278 })
    expect(excluded.map((e) => e.amount).sort((a, b) => b - a)).toEqual([390_075, 8_800])
  })
})
