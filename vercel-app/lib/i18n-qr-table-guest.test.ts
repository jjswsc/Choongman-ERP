import { describe, expect, it } from 'vitest'
import {
  I18N_QR_TABLE_ADMIN_EN,
  I18N_QR_TABLE_ADMIN_KO,
  I18N_QR_TABLE_ADMIN_TH,
} from '@/lib/i18n-qr-table-admin'
import { qrGuestDictKeys, qrGuestLangs, qrGuestT, normalizeQrGuestLang } from '@/lib/i18n-qr-table-guest'

describe('qr guest i18n', () => {
  it('defaults to Thai when language is empty or unknown', () => {
    expect(normalizeQrGuestLang('')).toBe('th')
    expect(normalizeQrGuestLang('fr')).toBe('th')
  })

  it('maps Myanmar locale codes', () => {
    expect(normalizeQrGuestLang('my')).toBe('my')
    expect(normalizeQrGuestLang('my-MM')).toBe('my')
    expect(normalizeQrGuestLang('bur')).toBe('my')
  })

  it('maps Hindi, Arabic, and Portuguese locale codes', () => {
    expect(normalizeQrGuestLang('hi-IN')).toBe('hi')
    expect(normalizeQrGuestLang('ar-SA')).toBe('ar')
    expect(normalizeQrGuestLang('pt-BR')).toBe('pt')
    expect(normalizeQrGuestLang('pt-PT')).toBe('pt')
  })

  it('keeps the same keys in all 11 guest languages', () => {
    const keys = qrGuestDictKeys()
    expect(qrGuestLangs()).toEqual(['th', 'en', 'ko', 'zh', 'ja', 'vi', 'my', 'ru', 'hi', 'ar', 'pt'])
    for (const locale of qrGuestLangs()) {
      for (const key of keys) {
        const value = qrGuestT(locale, key)
        expect(String(value || '').trim(), `${locale}.${key}`).not.toBe('')
        expect(value, `${locale}.${key} should not fall back to the raw key`).not.toBe(key)
      }
    }
  })

  it('keeps {n} placeholders in every language', () => {
    for (const key of qrGuestDictKeys()) {
      if (!qrGuestT('en', key).includes('{n}')) continue
      for (const locale of qrGuestLangs()) {
        expect(qrGuestT(locale, key), `${locale}.${key}`).toContain('{n}')
      }
    }
  })

  it('does not leave English kitchen-send labels on other locales', () => {
    for (const locale of qrGuestLangs().filter((l) => l !== 'en')) {
      expect(qrGuestT(locale, 'sendKitchen').toLowerCase(), locale).not.toContain('send to kitchen')
      expect(qrGuestT(locale, 'sendKitchen').toLowerCase(), locale).not.toBe('complete order')
    }
    expect(qrGuestT('my', 'sendKitchen')).toMatch(/[\u1000-\u109F]/)
    expect(qrGuestT('my', 'languageBar')).toBe('ဘာသာစကား')
    expect(qrGuestT('hi', 'languageBar')).toBe('भाषा')
    expect(qrGuestT('ar', 'languageBar')).toBe('اللغة')
    expect(qrGuestT('pt', 'sendKitchen')).toBe('Concluir pedido')
    expect(qrGuestT('hi', 'sendKitchen')).toMatch(/[\u0900-\u097F]/)
    expect(qrGuestT('ar', 'sendKitchen')).toMatch(/[\u0600-\u06FF]/)
  })
})

describe('qr table admin i18n', () => {
  it('keeps the same keys in ko, en, and th', () => {
    const ko = Object.keys(I18N_QR_TABLE_ADMIN_KO).sort()
    expect(Object.keys(I18N_QR_TABLE_ADMIN_EN).sort()).toEqual(ko)
    expect(Object.keys(I18N_QR_TABLE_ADMIN_TH).sort()).toEqual(ko)
  })
})
