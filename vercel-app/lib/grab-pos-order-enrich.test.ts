import { describe, expect, it } from 'vitest'
import { resolveGrabMerchantPosTotal } from '@/lib/grab-pos-order-enrich'
import {
  buildGrabPosCatalog,
  grabItemNameImpliesAllInPrice,
  parseGrabPartnerItemMenuRef,
  collectGrabPrintOptionLines,
  formatGrabLineNoteForKitchenPrint,
  formatGrabOrderLineNoteForPrint,
  formatGrabPromoComposeLinesForPrint,
  resolveGrabDeliveryLineNote,
  resolveGrabPrintNoteRequest,
  resolveGrabItemNameAndMeta,
  resolveGrabLineUnitMinor,
  resolveOptionCodesToLabels,
  synthesizeGrabItemOptionNote,
  resolveGrabItemPrintNote,
} from '@/lib/grab-pos-order-enrich'

describe('resolveGrabMerchantPosTotal', () => {
  it('subtracts Grab platform delivery fee from webhook total', () => {
    expect(
      resolveGrabMerchantPosTotal({
        itemsSubtotal: 1107,
        pricingFinalTotal: 1107,
        totalFromWebhook: 1117,
        grabPlatformDeliveryFee: 10,
      })
    ).toBe(1107)
  })
})

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

  it('falls back to POS menu code when item id menuId is stale', () => {
    const catalog = buildGrabPosCatalog(
      [{ id: 74, name: 'GARLIC Bar.B.Q FRIED CHICKEN', code: 'C022' }],
      []
    )
    const resolved = resolveGrabItemNameAndMeta({ id: 'item-9999-c022', name: 'item-9999-c022' }, catalog)
    expect(resolved.name).toBe('GARLIC Bar.B.Q FRIED CHICKEN')
    expect(resolved.menuId).toBe('74')
  })

  it('resolves promo by explicit promo code token first', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [],
      [
        { id: '1', name: 'Set 1', code: 'SET1', items: [{ menuId: '74', optionId: null, quantity: 1 }] },
      ]
    )
    const resolved = resolveGrabItemNameAndMeta({ name: 'grab campaign', promoCode: 'set1' }, catalog)
    expect(resolved.promoCode).toBe('SET1')
    expect(resolved.promoId).toBe('1')
  })

  it('resolves promo by exact readable name (Grab single-line set)', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [],
      [
        {
          id: '93',
          name: 'PEPSI MEGA 3',
          code: '260457-S03',
          items: [
            { menuId: '10', optionId: '1', quantity: 1 },
            { menuId: '11', optionId: '2', quantity: 1 },
          ],
        },
      ]
    )
    const resolved = resolveGrabItemNameAndMeta({ name: 'PEPSI MEGA 3' }, catalog)
    expect(resolved.name).toBe('PEPSI MEGA 3')
    expect(resolved.promoId).toBe('93')
    expect(resolved.promoCode).toBe('260457-S03')
    expect(resolved.promoItems?.length).toBe(2)
  })

  it('does not fuzzy-match promo by partial name', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [],
      [
        { id: '1', name: 'April Set 1', code: 'SET1', items: [{ menuId: '74', optionId: null, quantity: 1 }] },
      ]
    )
    const resolved = resolveGrabItemNameAndMeta({ name: 'April' }, catalog)
    expect(resolved.promoId).toBeUndefined()
    expect(resolved.promoCode).toBeUndefined()
  })

  it('converts optc note chunk to readable option chips', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C009-5', name: 'Pickled Radish' }])
    const meta = resolveGrabDeliveryLineNote('optc:C009-5', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['Pickled Radish'])
    expect(meta.requestSummary).toBe('')
  })

  it('converts mods note chunk with POS option codes to readable chips', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C020-1', name: 'Boneless' },
        { optionCode: 'C020-4', name: 'Kimchi' },
      ]
    )
    const meta = resolveGrabDeliveryLineNote('mods:C020-1, C020-4', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['Boneless', 'Kimchi'])
  })

  it('ignores numeric-only modifier tokens in mods chunk', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [{ optionCode: 'C015-4', name: 'Pickled Radish' }]
    )
    const meta = resolveGrabDeliveryLineNote('mods:1, 2, Pickled Radish · optc:C015-4', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['Pickled Radish'])
  })

  it('maps extended optc codes by prefix fallback', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C020-1', name: 'Boneless' }])
    const meta = resolveGrabDeliveryLineNote('optc:C020-1-2', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['Boneless'])
  })

  it('maps plain note code token to readable option chip', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C008-1', name: 'M - ชีส' }])
    const meta = resolveGrabDeliveryLineNote('C008-1', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['M - ชีส'])
    expect(meta.requestSummary).toBe('')
  })

  it('formatGrabOrderLineNoteForPrint omits unresolved option codes', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C011-1', name: 'S Boneless' }])
    expect(formatGrabOrderLineNoteForPrint('C011-1, C011-5', catalog.optionNameByCode)).toBe('S Boneless')
    expect(formatGrabOrderLineNoteForPrint('C011-9', catalog.optionNameByCode)).toBe('')
  })

  it('maps comma-separated plain note codes to readable option chips', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-3', name: 'M - 순살' },
        { optionCode: 'C011-5', name: 'Kimchi 30g.' },
      ]
    )
    const meta = resolveGrabDeliveryLineNote('C011-3, C011-5', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['M - 순살', 'Kimchi 30g.'])
  })

  it('resolveGrabItemPrintNote merges optc into existing note', () => {
    expect(
      resolveGrabItemPrintNote({
        note: 'mods:Kimchi 30g.',
        optionCode1: 'C011-2',
        optionCodes: ['C011-5'],
      })
    ).toBe('mods:Kimchi 30g. · optc:C011-2,C011-5')
  })

  it('synthesizeGrabItemOptionNote rebuilds optc note from item fields', () => {
    expect(
      synthesizeGrabItemOptionNote({
        note: '',
        optionCode1: 'C011-2',
        optionCodes: ['C011-5'],
      })
    ).toBe('optc:C011-2,C011-5')
    expect(synthesizeGrabItemOptionNote({ note: 'mods:Size S', optionCode1: 'C011-1' })).toBe(
      'mods:Size S · optc:C011-1'
    )
  })

  it('maps "Item note:" prefixed code list to readable option chips', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'c009-1', name: 'M - น้ำลาย' },
        { optionCode: 'c009-4', name: 'Kimchi 30g.' },
      ]
    )
    const meta = resolveGrabDeliveryLineNote('Item note: C009-1, C009-4', catalog.optionNameByCode)
    expect(meta.optionChips).toEqual(['M - น้ำลาย', 'Kimchi 30g.'])
    expect(meta.requestSummary).toBe('')
  })

  it('maps mixed plain note tokens (name + code) into readable option chips', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C024-1', name: 'Pickled Radish' }])
    const meta = resolveGrabDeliveryLineNote(
      'CHEESE TORNADO, RED HOT CHICKEN, C024-1',
      catalog.optionNameByCode
    )
    expect(meta.optionChips).toEqual(['CHEESE TORNADO', 'RED HOT CHICKEN', 'Pickled Radish'])
    expect(meta.requestSummary).toBe('')
  })

  it('resolveGrabPrintNoteRequest keeps eco cutlery on hall/customer receipts', () => {
    const note = 'mods:Size S · eco:no plastic cutlery requested'
    expect(resolveGrabPrintNoteRequest(note)).toBe('eco:no plastic cutlery requested')
    expect(formatGrabOrderLineNoteForPrint(note)).toContain('eco:no plastic cutlery requested')
  })

  it('resolveGrabPrintNoteRequest translates eco cutlery with t', () => {
    const t = (key: string) =>
      key === 'posGrabEcoCutleryNotRequested' ? '1회용 수저·포크 불필요' : key
    expect(resolveGrabPrintNoteRequest('eco:no plastic cutlery requested', undefined, t)).toBe(
      '1회용 수저·포크 불필요'
    )
    expect(
      resolveGrabPrintNoteRequest(
        'less spicy · eco:plastic cutlery requested',
        undefined,
        (k) => (k === 'posGrabEcoCutleryRequested' ? '1회용 수저·포크 필요' : k)
      )
    ).toBe('less spicy · 1회용 수저·포크 필요')
  })

  it('formatGrabLineNoteForKitchenPrint omits eco cutlery', () => {
    const catalog = buildGrabPosCatalog([], [{ optionCode: 'C011-1', name: 'S Boneless' }])
    const note = 'mods:S Boneless · optc:C011-1 · eco:plastic cutlery requested · less spicy'
    expect(formatGrabLineNoteForKitchenPrint(note, catalog.optionNameByCode)).toBe(
      'S Boneless · less spicy'
    )
    expect(collectGrabPrintOptionLines({ note, optionNameByCode: catalog.optionNameByCode })).toEqual([
      'S Boneless',
    ])
  })

  it('collectGrabPrintOptionLines returns one chip per option', () => {
    const catalog = buildGrabPosCatalog(
      [],
      [
        { optionCode: 'C011-3', name: 'SOY SAUCE AND SPRING ONION CHICKEN' },
        { optionCode: 'C011-4', name: 'CURRYCANE' },
        { optionCode: 'C011-5', name: 'Kimchi' },
      ]
    )
    expect(
      collectGrabPrintOptionLines({
        note: 'optc:C011-3, C011-4, C011-5',
        optionNameByCode: catalog.optionNameByCode,
      })
    ).toEqual(['SOY SAUCE AND SPRING ONION CHICKEN', 'CURRYCANE', 'Kimchi'])
  })

  it('formatGrabPromoComposeLinesForPrint splits multi-option compose when grab', () => {
    expect(
      formatGrabPromoComposeLinesForPrint(
        { menuName: 'GOLDEN FRIED CHICKEN', optionName: 'M - Boneless, Pickled Radish 30g.', quantity: 1 },
        true
      )
    ).toEqual(['GOLDEN FRIED CHICKEN (M - Boneless) x1', 'GOLDEN FRIED CHICKEN (Pickled Radish 30g.) x1'])
    expect(
      formatGrabPromoComposeLinesForPrint(
        { menuName: 'Rice', optionName: '', quantity: 1 },
        true
      )
    ).toEqual(['Rice x1'])
  })

  it('formatGrabPromoComposeLinesForPrint omits menu name when parent matches (banban)', () => {
    expect(
      formatGrabPromoComposeLinesForPrint(
        {
          menuName: 'Banban Chicken',
          optionName: 'SOY SAUCE CHICKEN, SPICY YANGNYEOM',
          quantity: 1,
          parentItemName: 'Banban Chicken',
        },
        true
      )
    ).toEqual(['SOY SAUCE CHICKEN x1', 'SPICY YANGNYEOM x1'])
  })

  it('formatGrabPromoComposeLinesForPrint splits slash-separated banban flavors', () => {
    expect(
      formatGrabPromoComposeLinesForPrint(
        {
          menuName: 'Banban Chicken',
          optionName: 'CHEESE TORNADO / GARLIC Bar.B.Q FRIED CHICKEN',
          quantity: 1,
          parentItemName: 'Banban Chicken',
        },
        false
      )
    ).toEqual(['CHEESE TORNADO x1', 'GARLIC Bar.B.Q FRIED CHICKEN x1'])
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

  it('does not add modifier surcharge when selection is already present', () => {
    const unit = resolveGrabLineUnitMinor({
      lineMinor: 0,
      qty: 1,
      unitBaseMinor: 25900,
      modifierMinorPerLine: 10000,
      itemName: 'GOCHUJANG Bar.B.Q FRIED CHICKEN',
      hasSelections: true,
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
