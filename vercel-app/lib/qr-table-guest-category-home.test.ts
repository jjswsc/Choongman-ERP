import { describe, expect, it } from 'vitest'
import {
  formatQrGuestTableLabel,
  isQrGuestCategoryHomePilotStore,
} from '@/lib/qr-table-guest-category-home'

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

describe('formatQrGuestTableLabel', () => {
  it('strips trailing 번 from table names', () => {
    expect(formatQrGuestTableLabel('14번')).toBe('14')
    expect(formatQrGuestTableLabel('2번')).toBe('2')
    expect(formatQrGuestTableLabel('A1')).toBe('A1')
    expect(formatQrGuestTableLabel('')).toBe('')
  })
})
