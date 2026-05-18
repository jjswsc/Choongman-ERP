import { describe, expect, it } from 'vitest'
import {
  buildKitchenMenuNameLookup,
  kitchenMenuNameOrPlaceholder,
  resolveKitchenMenuNameFromLookup,
} from '@/lib/pos-kitchen-menu-display-name'

describe('resolveKitchenMenuNameFromLookup', () => {
  const lookup = buildKitchenMenuNameLookup([
    { id: '26', name: 'Fried Chicken', code: 'FC026' },
    { id: '99', name: 'Tofu Soup', code: 'SOUP' },
  ])

  it('uses menuName snapshot first', () => {
    expect(resolveKitchenMenuNameFromLookup('26', lookup, 'Cached Name')).toBe('Cached Name')
  })

  it('resolves by menu id', () => {
    expect(resolveKitchenMenuNameFromLookup('26', lookup)).toBe('Fried Chicken')
  })

  it('resolves when promo stored menu code instead of id', () => {
    expect(resolveKitchenMenuNameFromLookup('SOUP', lookup)).toBe('Tofu Soup')
  })

  it('placeholder avoids bare numeric id on slip', () => {
    expect(kitchenMenuNameOrPlaceholder('26', '')).toBe('#26')
    expect(kitchenMenuNameOrPlaceholder('26', 'Fried Chicken')).toBe('Fried Chicken')
  })
})
