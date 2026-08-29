import { describe, expect, it } from 'vitest'
import { guessLangFromNavigator } from './lang-context'

describe('guessLangFromNavigator', () => {
  it('uses the tablet OS language when no saved preference exists', () => {
    expect(guessLangFromNavigator('th-TH')).toBe('th')
    expect(guessLangFromNavigator('ko-KR')).toBe('ko')
    expect(guessLangFromNavigator('en-US')).toBe('en')
  })

  it('returns null for empty or unknown values', () => {
    expect(guessLangFromNavigator('')).toBeNull()
    expect(guessLangFromNavigator('xx-XX')).toBeNull()
  })
})
