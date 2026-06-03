import { describe, expect, it } from 'vitest'
import {
  GRAB_MENU_MODIFIER_NAME_MAX_LENGTH,
  composeGrabModifierName,
} from '@/lib/grab-menu-limits'

/**
 * Grab MenuModifier 에는 description 필드가 없어, 옵션 옆 설명을 이름 텍스트에 합쳐 보낸다.
 * (사진1처럼 "S 사이즈 (뼈 없는 5조각 / 175G.)" 형태로 노출)
 */
describe('composeGrabModifierName', () => {
  it('설명이 있으면 이름 뒤에 괄호로 합친다', () => {
    expect(composeGrabModifierName('S 사이즈', '뼈 없는 5조각 / 175G.')).toBe(
      'S 사이즈 (뼈 없는 5조각 / 175G.)'
    )
  })

  it('설명이 비어 있으면 이름만 반환한다', () => {
    expect(composeGrabModifierName('Boneless', '')).toBe('Boneless')
    expect(composeGrabModifierName('Boneless', null)).toBe('Boneless')
    expect(composeGrabModifierName('Boneless', undefined)).toBe('Boneless')
  })

  it('이름·설명의 앞뒤 공백과 중복 공백을 정리한다', () => {
    expect(composeGrabModifierName('  레귤러  ', '  뼈 없는   9조각  ')).toBe(
      '레귤러 (뼈 없는 9조각)'
    )
  })

  it('HTML/제어문자를 제거한다', () => {
    expect(composeGrabModifierName('<b>윙</b>', '끝부분\t(5개)')).toBe('윙 (끝부분 (5개))')
  })

  it('합친 결과가 최대 길이를 넘으면 절단한다', () => {
    const longDesc = '가'.repeat(300)
    const out = composeGrabModifierName('이름', longDesc)
    expect(out.length).toBeLessThanOrEqual(GRAB_MENU_MODIFIER_NAME_MAX_LENGTH)
  })

  it('이름만으로도 최대 길이를 넘으면 절단한다', () => {
    const longName = 'X'.repeat(300)
    const out = composeGrabModifierName(longName, '')
    expect(out.length).toBe(GRAB_MENU_MODIFIER_NAME_MAX_LENGTH)
  })
})
