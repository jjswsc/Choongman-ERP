import { describe, expect, it } from 'vitest'
import {
  buildGrabPosCatalog,
  grabItemNameImpliesAllInPrice,
  parseGrabPartnerItemMenuRef,
  resolveGrabDeliveryLineNote,
  resolveGrabItemNameAndMeta,
  resolveGrabLineUnitMinor,
  resolveOptionCodesToLabels,
} from '@/lib/grab-pos-order-enrich'

describe('grab-pos-order-enrich', () => {
  it('parses Grab partner item id to menu id', () => {
    expect(parseGrabPartnerItemMenuRef('item-74-garlic')).toEqual({ menuId: 74, code: 'garlic' })
    expect(parseGrabPartnerItemMenuRef('grab:item-12')).toEqual({ menuId: 12, code: '' })
  })

  it('resolves menu name from item id and maps option codes to labels', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 74, name: 'GARLIC Bar.B.Q FRIED CHICKEN', code: 'C022' }],
      [{ optionCode: 'C022-1', name: 'Boneless' }]
    )
    const resolved = resolveGrabItemNameAndMeta({ id: 'item-74-c022', name: 'item-74-c022' }, catalog)
    expect(resolved.name).toBe('GARLIC Bar.B.Q FRIED CHICKEN')
    expect(resolved.menuId).toBe('74')
    expect(resolveOptionCodesToLabels(['C022-1'], catalog.optionNameByCode)).toEqual(['Boneless'])
  })

  it('converts optc note chunk to readable option chips', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C009-5', name: 'Pickled Radish' }])
    const meta = resolveGrabDeliveryLineNote('optc:C009-5', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['Pickled Radish'])
    expect(meta.requestSummary).toBe('')
  })

  it('avoids double-counting M-size surcharge when item name includes size', () => {
    expect(grabItemNameImpliesAllInPrice('GARLIC + M - Boneless')).toBe(true)
    const unit = resolveGrabLineUnitMinor({
      lineMinor: 0,
      qty: 1,
      unitBaseMinor: 25900,
      modifierMinorPerLine: 10000,
      itemName: 'GARLIC Bar.B.Q FRIED CHICKEN + M - Boneless',
    })
    expect(unit).toBe(25900)
  })

  it('adds modifier surcharge when line total is absent and name has no embedded size', () => {
    const unit = resolveGrabLineUnitMinor({
      lineMinor: 0,
      qty: 1,
      unitBaseMinor: 15900,
      modifierMinorPerLine: 10000,
      itemName: 'SOY SAUCE FRIED CHICKEN',
    })
    expect(unit).toBe(25900)
  })

  it('prefers line total minor when present', () => {
    const unit = resolveGrabLineUnitMinor({
      lineMinor: 25900,
      qty: 1,
      unitBaseMinor: 35900,
      modifierMinorPerLine: 10000,
      itemName: 'GARLIC + M - Boneless',
    })
    expect(unit).toBe(25900)
  })
})
