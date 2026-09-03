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
  it('uses stored i18n when present', () => {
    expect(
      resolvePosMenuGuestName({
        name: 'Banban Chicken',
        nameI18n: { ko: '반반 치킨' },
        lang: 'ko',
      })
    ).toBe('반반 치킨')
  })

  it('keeps English names in English', () => {
    expect(resolvePosMenuGuestName({ name: 'Banban Chicken', lang: 'en' })).toBe('Banban Chicken')
  })

  it('translates common English chicken names for Korean and Thai', () => {
    expect(resolvePosMenuGuestName({ name: 'Banban Chicken', lang: 'ko' })).toBe('반반 치킨')
    expect(resolvePosMenuGuestName({ name: 'GUCHUJANG Bar.B.Q FRIED CHICKEN', lang: 'ko' })).toBe(
      '고추장 바베큐 후라이드 치킨'
    )
    expect(resolvePosMenuGuestName({ name: 'SOY SAUCE Bar.B.Q FRIED CHICKEN', lang: 'th' })).toContain(
      'ซอสถั่วเหลือง'
    )
  })
})

describe('resolvePosMenuGuestDescription', () => {
  it('shows Thai table copy only for Thai guests', () => {
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
        descriptionDefault: 'Fried chicken tossed in gochujang sauce',
        lang: 'ko',
      })
    ).toBe('Fried chicken tossed in gochujang sauce')
    expect(
      resolvePosMenuGuestDescription({
        description: th,
        lang: 'ko',
      })
    ).toBe('')
  })

  it('prefers language map over channel copy', () => {
    expect(
      resolvePosMenuGuestDescription({
        description: 'ไก่ทอด',
        descriptionI18n: { ko: '고추장에 버무린 후라이드 치킨' },
        lang: 'ko',
      })
    ).toBe('고추장에 버무린 후라이드 치킨')
  })
})

describe('resolvePosMenuGuestLabel', () => {
  it('translates category chips without changing the source key', () => {
    expect(resolvePosMenuGuestLabel('Chicken', 'ko')).toBe('치킨')
    expect(resolvePosMenuGuestLabel('Drinks', 'th')).toBe('เครื่องดื่ม')
    expect(resolvePosMenuGuestLabel('Banban', 'ko')).toBe('반반')
  })
})
