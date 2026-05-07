import { describe, expect, it } from 'vitest'
import type { PosMenu } from '@/lib/api-client'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'

describe('resolvePosOrderItemMenuDisplayName', () => {
  it('keeps decorated raw name for Banban/option style labels', () => {
    const menus = [
      { id: 'm-banban', name: 'Banban Chicken', code: 'BANBAN' },
    ] as PosMenu[]
    const resolved = resolvePosOrderItemMenuDisplayName(
      {
        id: 'banban-1',
        name: 'Banban Chicken (GUCHUJANG Bar.B.Q FRIED CHICKEN / CHEESE TORNADO)',
        menuId: 'm-banban',
      },
      menus
    )
    expect(resolved).toBe('Banban Chicken (GUCHUJANG Bar.B.Q FRIED CHICKEN / CHEESE TORNADO)')
  })

  it('still resolves machine-like code names to catalog menu name', () => {
    const menus = [
      { id: 'm-1', name: 'Soy Sauce Chicken', code: 'SOY' },
    ] as PosMenu[]
    const resolved = resolvePosOrderItemMenuDisplayName(
      {
        id: 'item-123-soy',
        name: 'item-123-soy',
      },
      menus
    )
    expect(resolved).toBe('Soy Sauce Chicken')
  })
})
