import { describe, expect, it } from 'vitest'
import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'

describe('isQrBuffetPackageKitchenSkipLine', () => {
  it('skips synthetic buffet-entry id', () => {
    expect(isQrBuffetPackageKitchenSkipLine({ id: 'buffet-entry-12', name: '[Buffet] Buffet 499 × 2' })).toBe(
      true
    )
  })

  it('skips isBuffetEntry even with another id', () => {
    expect(isQrBuffetPackageKitchenSkipLine({ id: 'line-1', isBuffetEntry: true })).toBe(true)
  })

  it('does not skip real buffet-included kitchen items', () => {
    expect(
      isQrBuffetPackageKitchenSkipLine({
        id: 'menu-uuid-1',
        name: '[Buffet] Fried Chicken',
        source: 'qr_table',
        buffetIncluded: true,
      })
    ).toBe(false)
  })
})
