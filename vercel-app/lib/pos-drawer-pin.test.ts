import { describe, expect, it } from 'vitest'
import { drawerOpenRequiresPin, isValidPosDrawerPin } from '@/lib/pos-drawer-pin'

describe('isValidPosDrawerPin', () => {
  it('accepts exactly 6 digits', () => {
    expect(isValidPosDrawerPin('123456')).toBe(true)
    expect(isValidPosDrawerPin('000000')).toBe(true)
  })

  it('rejects non-6-digit', () => {
    expect(isValidPosDrawerPin('')).toBe(false)
    expect(isValidPosDrawerPin('12345')).toBe(false)
    expect(isValidPosDrawerPin('1234567')).toBe(false)
    expect(isValidPosDrawerPin('12a456')).toBe(false)
  })
})

describe('drawerOpenRequiresPin', () => {
  it('skips when PIN not configured', () => {
    expect(drawerOpenRequiresPin('manual', false)).toBe(false)
    expect(drawerOpenRequiresPin('till_deposit', false)).toBe(false)
  })

  it('requires PIN for non-payment sources when configured', () => {
    expect(drawerOpenRequiresPin('manual', true)).toBe(true)
    expect(drawerOpenRequiresPin('till_deposit', true)).toBe(true)
    expect(drawerOpenRequiresPin('business_open_nav', true)).toBe(true)
  })

  it('excludes payment_auto even when PIN configured', () => {
    expect(drawerOpenRequiresPin('payment_auto', true)).toBe(false)
  })
})
