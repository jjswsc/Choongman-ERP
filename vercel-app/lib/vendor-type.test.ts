import { describe, expect, it } from 'vitest'
import {
  isPurchasePickerVendorType,
  isRelatedVendorType,
  mapVendorType,
  mapVendorTypeToDb,
} from './vendor-type'

describe('vendor-type', () => {
  it('maps related and Korean alias', () => {
    expect(mapVendorType('related')).toBe('related')
    expect(mapVendorType('관련당사자')).toBe('related')
    expect(isRelatedVendorType('related')).toBe(true)
    expect(mapVendorTypeToDb('related')).toBe('related')
  })

  it('hides related from purchase pickers', () => {
    expect(isPurchasePickerVendorType('related')).toBe(false)
    expect(isPurchasePickerVendorType('purchase')).toBe(true)
    expect(isPurchasePickerVendorType('both')).toBe(true)
    expect(isPurchasePickerVendorType('sales')).toBe(false)
  })

  it('does not coerce related to purchase on save', () => {
    expect(mapVendorTypeToDb('related')).not.toBe('purchase')
  })
})
