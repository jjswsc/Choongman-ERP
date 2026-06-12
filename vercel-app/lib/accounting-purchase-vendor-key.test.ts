import { describe, expect, it } from 'vitest'
import {
  buildVendorPurchaseKeyIndex,
  excludeBankPurchasesWhenDirectInboundPresent,
  normalizeVendorAmountMap,
  purchaseVendorKeyMatchesRaw,
  resolvePurchaseVendorKey,
} from './accounting-purchase-vendor-key'

const index = buildVendorPurchaseKeyIndex([
  { code: 'KLEVER', name: 'Klever Goods Co., Ltd.', gps_name: null },
  { code: 'NICE', name: 'Nice Choice Co., Ltd.' },
])

describe('resolvePurchaseVendorKey', () => {
  it('maps vendor name and code to canonical code', () => {
    expect(resolvePurchaseVendorKey('Klever Goods Co., Ltd.', index)).toBe('KLEVER')
    expect(resolvePurchaseVendorKey('klever', index)).toBe('KLEVER')
  })
})

describe('normalizeVendorAmountMap', () => {
  it('merges inbound name and bank code into one vendor row', () => {
    const merged = normalizeVendorAmountMap(
      {
        'Klever Goods Co., Ltd.': 886_692,
        KLEVER: 394_531,
      },
      index
    )
    expect(merged).toEqual({ KLEVER: 1_281_223 })
  })
})

describe('excludeBankPurchasesWhenDirectInboundPresent', () => {
  it('drops bank when inbound exists for same normalized key', () => {
    const inbound = { KLEVER: 886_692 }
    const bank = { KLEVER: 394_531, NICE: 12_480 }
    expect(excludeBankPurchasesWhenDirectInboundPresent(inbound, bank)).toEqual({ NICE: 12_480 })
  })
})

describe('purchaseVendorKeyMatchesRaw', () => {
  it('matches drill-down rows across name vs code', () => {
    expect(purchaseVendorKeyMatchesRaw('KLEVER', 'Klever Goods Co., Ltd.', index)).toBe(true)
    expect(purchaseVendorKeyMatchesRaw('KLEVER', 'KLEVER', index)).toBe(true)
    expect(purchaseVendorKeyMatchesRaw('KLEVER', 'NICE', index)).toBe(false)
  })
})
