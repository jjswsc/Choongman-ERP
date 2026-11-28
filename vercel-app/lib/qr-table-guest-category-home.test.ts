import { describe, expect, it } from 'vitest'
import {
  formatQrGuestTableLabel,
  isQrGuestCategoryHomeEnabled,
  isQrGuestCategoryHomePilotStore,
  pickQrGuestCategoryImageRaw,
} from '@/lib/qr-table-guest-category-home'

describe('isQrGuestCategoryHomeEnabled', () => {
  it('is on for every store, including ones that were outside the office pilot', () => {
    expect(isQrGuestCategoryHomeEnabled('office')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('Office')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('본사')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('HQ')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('silom')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('CM Rama2')).toBe(true)
    expect(isQrGuestCategoryHomeEnabled('')).toBe(true)
    expect(isQrGuestCategoryHomePilotStore('silom')).toBe(true)
  })
})

describe('pickQrGuestCategoryImageRaw', () => {
  it('prefers the admin upload, then the first menu photo', () => {
    expect(
      pickQrGuestCategoryImageRaw({
        categoryKey: 'Katsu',
        adminUrls: { Katsu: ' https://cdn.example/katsu.jpg ' },
        menuImageUrls: ['https://cdn.example/menu.jpg'],
      })
    ).toBe('https://cdn.example/katsu.jpg')
    expect(
      pickQrGuestCategoryImageRaw({
        categoryKey: 'Soup & Stew',
        adminUrls: { 'Soup & Stew': '  ' },
        menuImageUrls: ['', ' https://cdn.example/soup.jpg '],
      })
    ).toBe('https://cdn.example/soup.jpg')
    expect(
      pickQrGuestCategoryImageRaw({
        categoryKey: 'Noodle',
        adminUrls: {},
        menuImageUrls: ['', ' '],
      })
    ).toBe('')
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
