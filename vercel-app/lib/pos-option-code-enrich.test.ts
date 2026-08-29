import { describe, expect, it } from 'vitest'
import {
  expandCombinedPosOptionCodeToken,
  flattenPosOrderItemOptionCodes,
  normalizeMemberPortalPickupItemForPosSave,
} from '@/lib/pos-option-code-enrich'

describe('pos-option-code-enrich', () => {
  it('splits multistep combined option codes', () => {
    expect(expandCombinedPosOptionCodeToken('C023-1+C023-5')).toEqual(['C023-1', 'C023-5'])
    expect(
      flattenPosOrderItemOptionCodes({
        optionCode: 'C023-2+C023-4',
      })
    ).toEqual(['C023-2', 'C023-4'])
  })

  it('normalizes member portal pickup lines to POS items_json fields', () => {
    const row = normalizeMemberPortalPickupItemForPosSave({
      menuId: '23',
      optionCode: 'C023-1+C023-5',
      name: 'CURRY Bar.B.Q FRIED CHICKEN (M - Boneless)',
      price: 259,
      qty: 1,
    })
    expect(row.menuId1).toBe('23')
    expect(row.optionCodes).toEqual(['C023-1', 'C023-5'])
    expect(row.optionCode1).toBe('C023-1')
    expect(row.optionCode2).toBe('C023-5')
  })

  it('does not treat menu or promo SKU as optionCode', () => {
    const chicken = normalizeMemberPortalPickupItemForPosSave({
      menuId: '20',
      code: 'C020',
      name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN (S Boneless)',
      price: 199,
      qty: 1,
    })
    expect(chicken.optionCode).toBeUndefined()
    expect(chicken.optionCodes).toBeUndefined()
    expect(chicken.name).toContain('S Boneless')

    const set = normalizeMemberPortalPickupItemForPosSave({
      menuId: '88',
      code: '260612-S02',
      name: '[Super Deal] Set 1',
      price: 199,
      qty: 1,
    })
    expect(set.optionCode).toBeUndefined()
    expect(set.optionCodes).toBeUndefined()
  })
})
