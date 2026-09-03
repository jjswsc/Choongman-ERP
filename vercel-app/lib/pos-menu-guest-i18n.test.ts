import { describe, expect, it } from 'vitest'
import {
  parsePosMenuI18nMap,
  resolvePosMenuGuestDescription,
  resolvePosMenuGuestLabel,
  resolvePosMenuGuestName,
} from '@/lib/pos-menu-guest-i18n'

describe('parsePosMenuI18nMap', () => {
  it('reads object and json string', () => {
    expect(parsePosMenuI18nMap({ KO: ' 반반 ', th: 'ไก่' })).toEqual({ ko: '반반', th: 'ไก่' })
    expect(parsePosMenuI18nMap('{"en":"Banban Chicken"}')).toEqual({ en: 'Banban Chicken' })
    expect(parsePosMenuI18nMap('')).toEqual({})
  })
})

describe('resolvePosMenuGuestName', () => {
  it('keeps POS menu names untranslated', () => {
    expect(resolvePosMenuGuestName({ name: 'Banban Chicken', lang: 'th' })).toBe('Banban Chicken')
    expect(resolvePosMenuGuestName({ name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN', lang: 'ko' })).toBe(
      'GUCHUJANG Bar.B.Q FRIED CHICKEN'
    )
    expect(
      resolvePosMenuGuestName({
        name: 'Banban Chicken',
        nameI18n: { ko: '반반 치킨' },
        lang: 'ko',
      })
    ).toBe('Banban Chicken')
  })
})

describe('resolvePosMenuGuestDescription', () => {
  it('uses language-specific description when stored', () => {
    expect(
      resolvePosMenuGuestDescription({
        description: 'ไก่ทอดคลุกซอสโคชูจัง',
        descriptionI18n: { ko: '고추장 소스에 버무린 후라이드 치킨' },
        lang: 'ko',
      })
    ).toBe('고추장 소스에 버무린 후라이드 치킨')
  })

  it('falls back to the original table description', () => {
    const th = 'ไก่ทอดคลุกซอสโคชูจัง'
    expect(
      resolvePosMenuGuestDescription({
        description: th,
        descriptionDefault: 'Fried chicken tossed in gochujang sauce',
        lang: 'th',
      })
    ).toBe(th)
    expect(
      resolvePosMenuGuestDescription({
        description: th,
        lang: 'ko',
      })
    ).toBe(th)
  })
})

describe('resolvePosMenuGuestLabel', () => {
  it('keeps category labels as stored', () => {
    expect(resolvePosMenuGuestLabel('Chicken')).toBe('Chicken')
    expect(resolvePosMenuGuestLabel('Banban')).toBe('Banban')
  })
})
