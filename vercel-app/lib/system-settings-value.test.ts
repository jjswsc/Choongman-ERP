import { describe, expect, it } from 'vitest'
import { readSystemSettingString } from '@/lib/system-settings-value'

describe('system-settings-value', () => {
  it('strips wrapping quotes from json string values', () => {
    expect(readSystemSettingString('"https://example.com/a.jpg"')).toBe('https://example.com/a.jpg')
    expect(readSystemSettingString('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
  })
})
