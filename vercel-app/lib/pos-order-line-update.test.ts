import { describe, expect, it } from 'vitest'
import { orderItemsToPosOrderItems } from '@/lib/pos-order-line-update'
import type { OrderItem } from '@/lib/pos-types'

describe('orderItemsToPosOrderItems', () => {
  it('반반 두 맛(menuId1/menuId2)을 유지한다', () => {
    const items: OrderItem[] = [
      { id: 'banban-27-28-x', name: 'Banban Chicken (A / B)', quantity: 1, price: 259, menuId1: '27', menuId2: '28' },
    ]
    expect(orderItemsToPosOrderItems(items)[0]).toMatchObject({ menuId1: '27', menuId2: '28' })
  })

  it('반반 부모 menuId 가 있으면 menuId1 은 부모 그대로, 맛 하나만 붙이지 않는다', () => {
    const items: OrderItem[] = [
      { id: 'grab:x:L0', name: 'Banban', quantity: 1, price: 279, menuId: '75', menuId1: '11', menuId2: '28' },
    ]
    const out = orderItemsToPosOrderItems(items)[0]
    expect(out.menuId1).toBe('75')
    expect(out.menuId2).toBeUndefined()
  })

  it('일반 줄 옵션 코드 유지', () => {
    const items: OrderItem[] = [
      { id: '11-298', name: 'Snow Onion', quantity: 2, price: 249, menuId: '11', optionId: '298', optionCode1: 'M1' },
    ]
    expect(orderItemsToPosOrderItems(items)[0]).toMatchObject({ menuId1: '11', optionId1: '298', optionCode1: 'M1', qty: 2 })
  })
})
