import { describe, expect, it } from 'vitest'
import { parseMemberPortalOrderItemsJson } from '@/lib/member-portal-order-items-parse'

describe('parseMemberPortalOrderItemsJson', () => {
  it('parses member portal checkout lines', () => {
    const items = parseMemberPortalOrderItemsJson(
      JSON.stringify([
        { menuId: '7', name: 'BBQ', price: 199, qty: 2, optionCode: 'M' },
      ])
    )
    expect(items).toEqual([
      { menuId: '7', optionCode: 'M', name: 'BBQ', price: 199, qty: 2 },
    ])
  })

  it('parses POS items_json menuId1 / option_id1 keys', () => {
    const items = parseMemberPortalOrderItemsJson(
      JSON.stringify([
        { menuId1: '12', option_id1: '34', name: 'Half Half', price: 299, quantity: 1 },
      ])
    )
    expect(items).toEqual([
      { menuId: '12', optionId: '34', name: 'Half Half', price: 299, qty: 1 },
    ])
  })

  it('returns empty array for invalid json', () => {
    expect(parseMemberPortalOrderItemsJson('not-json')).toEqual([])
    expect(parseMemberPortalOrderItemsJson(null)).toEqual([])
  })
})
