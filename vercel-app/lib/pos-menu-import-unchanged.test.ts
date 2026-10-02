import { describe, expect, it } from 'vitest'
import { isPosMenuImportRowUnchanged, type PosMenuImportExistingSnapshot } from '@/lib/pos-menu-import-unchanged'

function existing(overrides: Partial<PosMenuImportExistingSnapshot> = {}): PosMenuImportExistingSnapshot {
  return {
    code: 'MW04',
    name: 'Postcard',
    categoryMain: 'Merchandise',
    category: 'Watta',
    price: 100,
    priceDelivery: null,
    image: '',
    vatIncluded: true,
    isActive: true,
    sortOrder: 0,
    kitchenPrinter: null,
    cookingTimeMin: null,
    isBanban: false,
    optionSelectionGroups: null,
    storeCodes: ['1000'],
    ...overrides,
  }
}

describe('isPosMenuImportRowUnchanged', () => {
  it('skips a row that already matches the excel and the store', () => {
    expect(
      isPosMenuImportRowUnchanged(
        existing(),
        {
          code: 'MW04',
          name: 'Postcard',
          categoryMain: 'Merchandise',
          category: 'Watta',
          price: 100,
          priceDelivery: null,
          imageUrl: '',
          vatIncluded: true,
          isActive: true,
          sortOrder: 0,
          kitchenPrinter: null,
          cookingTimeMin: null,
          isBanban: false,
        },
        ['1000']
      )
    ).toBe(true)
  })

  it('does not skip when the category or store is different', () => {
    const body = {
      code: 'MP01',
      name: 'Bag',
      categoryMain: 'Merchandise',
      category: 'Pavement',
      price: 100,
      priceDelivery: null,
      vatIncluded: true,
      isActive: true,
      sortOrder: 0,
      isBanban: false,
    }
    expect(isPosMenuImportRowUnchanged(existing(), body, ['1000'])).toBe(false)
    expect(
      isPosMenuImportRowUnchanged(existing({ code: 'MP01', name: 'Bag', category: 'Pavement' }), body, ['1001'])
    ).toBe(false)
  })

  it('ignores an empty excel image so a saved photo is not treated as a change', () => {
    expect(
      isPosMenuImportRowUnchanged(
        existing({ image: 'https://cdn.example/menu.jpg' }),
        {
          code: 'MW04',
          name: 'Postcard',
          categoryMain: 'Merchandise',
          category: 'Watta',
          price: 100,
          priceDelivery: null,
          imageUrl: '',
          vatIncluded: true,
          isActive: true,
          sortOrder: 0,
          isBanban: false,
        },
        ['1000']
      )
    ).toBe(true)
  })
})
