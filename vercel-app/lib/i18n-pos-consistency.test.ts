import { describe, expect, it } from 'vitest'
import { i18n } from '@/lib/i18n'

const REQUIRED_POS_KEYS = ['posOptionDefault', 'posOptionGroupSize', 'posOptionGroupPart'] as const

describe('POS i18n consistency', () => {
  it('all locales have required POS keys', () => {
    const locales = Object.entries(i18n) as Array<[string, Record<string, string>]>
    for (const [locale, dict] of locales) {
      for (const key of REQUIRED_POS_KEYS) {
        const value = String(dict[key] ?? '').trim()
        expect(value, `${locale}.${key} missing`).not.toBe('')
      }
    }
  })

  it('posOptionDefault keeps S + Boneless hint for frontline languages', () => {
    const frontlineLocales = ['ko', 'en', 'th']
    for (const locale of frontlineLocales) {
      const dict = (i18n as Record<string, Record<string, string>>)[locale] || {}
      const v = String(dict.posOptionDefault ?? '')
      expect(v.toLowerCase(), `${locale}.posOptionDefault should mention boneless`).toContain('boneless')
      expect(v, `${locale}.posOptionDefault should mention size S`).toMatch(/s/i)
    }
  })
})

