import { describe, expect, it } from 'vitest'
import { storeMatchesIncomeFilter } from './accounting-store-match'
import {
  purchaseInboundLocationMatchesStore,
  purchaseStoreLocationIlikePatterns,
} from './accounting-stock-purchase-agg'

describe('purchaseStoreLocationIlikePatterns', () => {
  it('includes CM MBK and the short store token so hyphenated locations match', () => {
    const patterns = purchaseStoreLocationIlikePatterns('CM MBK')
    expect(patterns).toContain('%CM MBK%')
    expect(patterns).toContain('%MBK%')
  })
})

describe('purchaseInboundLocationMatchesStore', () => {
  it('treats CM-MBK as the same store as CM MBK', () => {
    expect(storeMatchesIncomeFilter('CM-MBK', 'CM MBK')).toBe(true)
    expect(purchaseInboundLocationMatchesStore('CM-MBK', 'CM MBK')).toBe(true)
  })

  it('does not pull another store', () => {
    expect(purchaseInboundLocationMatchesStore('CM Silom', 'CM MBK')).toBe(false)
  })
})
