import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const i18n = require('./offline-i18n.js') as {
  LANGS: string[]
  normalizeLang: (lang: string | null | undefined) => string | null
  guessLangFromNavigator: (language: string | null | undefined) => string | null
  resolveOfflineLang: (opts?: { persisted?: string | null; navigatorLanguage?: string | null }) => string
  getStrings: (lang: string | null | undefined) => { title: string; retryBtn: string; htmlLang: string }
  applyOfflineI18n: (doc: Document, lang: string) => { title: string }
}

describe('offline-i18n', () => {
  it('covers all POS UI languages', () => {
    expect(i18n.LANGS).toEqual(['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms'])
    for (const lang of i18n.LANGS) {
      const s = i18n.getStrings(lang)
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.retryBtn.length).toBeGreaterThan(0)
    }
  })

  it('prefers persisted POS language over OS language', () => {
    expect(
      i18n.resolveOfflineLang({ persisted: 'th', navigatorLanguage: 'ko-KR' })
    ).toBe('th')
  })

  it('falls back to navigator then en (not hard-coded Korean)', () => {
    expect(i18n.resolveOfflineLang({ persisted: null, navigatorLanguage: 'th-TH' })).toBe('th')
    expect(i18n.resolveOfflineLang({ persisted: '', navigatorLanguage: 'en-US' })).toBe('en')
    expect(i18n.resolveOfflineLang({ persisted: null, navigatorLanguage: '' })).toBe('en')
  })

  it('exposes Thai copy for the offline shell', () => {
    const s = i18n.getStrings('th')
    expect(s.htmlLang).toBe('th')
    expect(s.title).toContain('เครือข่าย')
    expect(s.retryBtn).toContain('ลองอีกครั้ง')
    expect(s.cacheBtn).toContain('เปิดจากแคช')
    expect(s.syncNote).toContain('ออฟไลน์')
  })
})
