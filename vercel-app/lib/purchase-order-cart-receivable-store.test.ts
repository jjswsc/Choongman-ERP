import { describe, expect, it } from 'vitest'
import { isHqWarehouseReceivableStoreName } from './internal-outbound'
import {
  resolveAccountingPoReceivableDebtorStoreName,
  resolveAccountingPoReceivableStoreName,
} from './purchase-order-cart'

function cart(meta: Record<string, unknown>, items: Array<{ store?: string }> = [{ qty: 1, price: 1 }]) {
  return JSON.stringify({ v: 1, items, meta })
}

describe('isHqWarehouseReceivableStoreName', () => {
  it('blocks HQ and warehouse labels', () => {
    expect(isHqWarehouseReceivableStoreName('본사')).toBe(true)
    expect(isHqWarehouseReceivableStoreName('S&J')).toBe(true)
    expect(isHqWarehouseReceivableStoreName('CM Office')).toBe(true)
    expect(isHqWarehouseReceivableStoreName('입고등록')).toBe(true)
    expect(isHqWarehouseReceivableStoreName('สาขาซื้อเอง')).toBe(true)
  })

  it('allows franchise stores', () => {
    expect(isHqWarehouseReceivableStoreName('CM Bangna')).toBe(false)
    expect(isHqWarehouseReceivableStoreName('CM Asoke')).toBe(false)
  })
})

describe('resolveAccountingPoReceivableDebtorStoreName', () => {
  it('does not fall back to warehouse location when relatedStore is missing', () => {
    const po = {
      cart_json: cart({ orderDate: '2026-07-03' }),
      location_name: '본사',
    }
    expect(resolveAccountingPoReceivableStoreName(po)).toBe('본사')
    expect(resolveAccountingPoReceivableDebtorStoreName(po)).toBe('')
  })

  it('uses relatedStore even when location is HQ warehouse', () => {
    const po = {
      cart_json: cart({ orderDate: '2026-07-03', relatedStore: 'CM Bangna' }),
      location_name: '본사',
    }
    expect(resolveAccountingPoReceivableDebtorStoreName(po)).toBe('CM Bangna')
  })

  it('blocks relatedStore that is HQ warehouse', () => {
    const po = {
      cart_json: cart({ orderDate: '2026-07-14', relatedStore: 'S&J' }),
      location_name: 'S&J',
    }
    expect(resolveAccountingPoReceivableDebtorStoreName(po)).toBe('')
  })
})
