import { describe, expect, it } from 'vitest'
import {
  CODE_AUTO_MAINS,
  POS_MENU_CODE_PREFIX_BY_MAIN,
  posMenuCodePlaceholderForMain,
  posMenuCodePrefixForMain,
} from '@/lib/pos-menu-next-code'

describe('pos-menu-next-code', () => {
  it('Food → F, placeholder F001', () => {
    expect(posMenuCodePrefixForMain('Food')).toBe('F')
    expect(posMenuCodePlaceholderForMain('Food')).toBe('F001')
    expect(CODE_AUTO_MAINS).toContain('Food')
    expect(POS_MENU_CODE_PREFIX_BY_MAIN.Food).toBe('F')
  })

  it('기존 대분류 접두사 유지', () => {
    expect(posMenuCodePrefixForMain('Chicken')).toBe('C')
    expect(posMenuCodePrefixForMain('Topping')).toBe('T')
    expect(posMenuCodePrefixForMain('Unknown')).toBeNull()
  })
})
