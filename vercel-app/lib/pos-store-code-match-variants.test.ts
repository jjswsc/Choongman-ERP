import { describe, expect, it } from 'vitest'
import {
  buildPosStoreCodeMatchVariants,
  posStoreCodeMatchesVariants,
} from '@/lib/pos-store-code-match-variants'

describe('buildPosStoreCodeMatchVariants', () => {
  const legacyToCanonical = {
    'cm silom': '1042',
    'cm true digital': '1040',
  }
  const storeLabels = {
    '1042': 'CM Silom',
    '1040': 'CM True Digital',
  }
  const catalogStoreCodes = ['1042', '1040', 'CM True Digital']

  it('expands 1042 terminal to CM Silom (Grab pos_orders store_code)', () => {
    const fromNumeric = buildPosStoreCodeMatchVariants({
      storeCode: '1042',
      catalogStoreCodes,
      legacyToCanonical,
      storeLabels,
    })
    expect(fromNumeric.some((v) => v.toLowerCase() === 'cm silom')).toBe(true)
    expect(fromNumeric.some((v) => v === '1042')).toBe(true)
    expect(posStoreCodeMatchesVariants('CM Silom', fromNumeric)).toBe(true)
  })

  it('expands CM Silom login to partner id 1042', () => {
    const fromName = buildPosStoreCodeMatchVariants({
      storeCode: 'CM Silom',
      catalogStoreCodes,
      legacyToCanonical,
      storeLabels,
    })
    expect(fromName.some((v) => v === '1042')).toBe(true)
    expect(posStoreCodeMatchesVariants('1042', fromName)).toBe(true)
  })

  it('does not match unrelated store codes', () => {
    const silom = buildPosStoreCodeMatchVariants({
      storeCode: '1042',
      catalogStoreCodes,
      legacyToCanonical,
      storeLabels,
    })
    expect(posStoreCodeMatchesVariants('CM Bangna', silom)).toBe(false)
    expect(posStoreCodeMatchesVariants('1043', silom)).toBe(false)
  })
})
