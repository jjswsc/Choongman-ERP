import { describe, expect, it } from 'vitest'
import {
  parseDeliveryAppCodeFromItemsJson,
  resolveOrderDeliveryAppCode,
} from '@/lib/pos-delivery-order-meta'

describe('parseDeliveryAppCodeFromItemsJson', () => {
  it('returns first deliveryAppCode', () => {
    expect(
      parseDeliveryAppCodeFromItemsJson(
        JSON.stringify([{ name: 'a' }, { deliveryAppCode: 'Grab' }])
      )
    ).toBe('grab')
  })
  it('returns empty for invalid json', () => {
    expect(parseDeliveryAppCodeFromItemsJson('not-json')).toBe('')
  })
})

describe('resolveOrderDeliveryAppCode', () => {
  it('prefers column', () => {
    expect(
      resolveOrderDeliveryAppCode({
        order_type: 'delivery',
        delivery_app_code: 'lineman',
        items_json: '[{"deliveryAppCode":"grab"}]',
      })
    ).toBe('lineman')
  })
  it('parses items for delivery only', () => {
    expect(
      resolveOrderDeliveryAppCode({
        order_type: 'delivery',
        items_json: '[{"deliveryAppCode":"SHOPEE"}]',
      })
    ).toBe('shopee')
  })
  it('returns empty for dine_in', () => {
    expect(
      resolveOrderDeliveryAppCode({
        order_type: 'dine_in',
        items_json: '[{"deliveryAppCode":"grab"}]',
      })
    ).toBe('')
  })
})
