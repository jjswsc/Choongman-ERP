import { describe, expect, it } from 'vitest'
import { isQrGuestCategoryHomePilotStore } from '@/lib/qr-table-guest-category-home'

describe('isQrGuestCategoryHomePilotStore', () => {
  it('allows office / HQ codes only', () => {
    expect(isQrGuestCategoryHomePilotStore('office')).toBe(true)
    expect(isQrGuestCategoryHomePilotStore('Office')).toBe(true)
    expect(isQrGuestCategoryHomePilotStore('본사')).toBe(true)
    expect(isQrGuestCategoryHomePilotStore('HQ')).toBe(true)
    expect(isQrGuestCategoryHomePilotStore('silom')).toBe(false)
    expect(isQrGuestCategoryHomePilotStore('')).toBe(false)
  })
})
