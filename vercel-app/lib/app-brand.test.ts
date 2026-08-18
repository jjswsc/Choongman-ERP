import { describe, expect, it } from 'vitest'
import { getAppBrandConfigForKey, isOmniAppHost } from '@/lib/app-brand'

describe('isOmniAppHost', () => {
  it('treats Omni and ifoodtech hosts as Omni', () => {
    expect(isOmniAppHost('app.omnifoodtech.com')).toBe(true)
    expect(isOmniAppHost('pos.ifoodtech.com')).toBe(true)
    expect(isOmniAppHost('ifoodtech.com')).toBe(true)
  })

  it('does not treat Chungman hosts as Omni', () => {
    expect(isOmniAppHost('erp.choongman.kr')).toBe(false)
    expect(isOmniAppHost('localhost:3000')).toBe(false)
    expect(isOmniAppHost('')).toBe(false)
  })
})

describe('posWindowTitle', () => {
  it('uses OMNI POS / CHOONGMAN POS for the window title', () => {
    expect(getAppBrandConfigForKey('omnifoodtech').posWindowTitle).toBe('OMNI POS')
    expect(getAppBrandConfigForKey('choongman').posWindowTitle).toBe('CHOONGMAN POS')
  })
})
