import { describe, expect, it } from 'vitest'
import { isBanbanMenu, parseBanbanFlavorsFromName } from './pos-banban-utils'

describe('parseBanbanFlavorsFromName', () => {
  it('기본 패턴 "Base (A / B)" 두 가지 맛을 분리한다', () => {
    expect(parseBanbanFlavorsFromName('Banban Chicken (S Boneless / M Boneless)')).toEqual({
      baseName: 'Banban Chicken',
      flavor1: 'S Boneless',
      flavor2: 'M Boneless',
    })
  })

  it('한국어 메뉴명도 처리한다', () => {
    expect(parseBanbanFlavorsFromName('반반 (양념 / 후라이드)')).toEqual({
      baseName: '반반',
      flavor1: '양념',
      flavor2: '후라이드',
    })
  })

  it('단일 옵션(슬래시 없음)은 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Chicken (M)')).toBeNull()
  })

  it('맛이 3개 이상이면 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Combo (A / B / C)')).toBeNull()
  })

  it('빈/괄호 없는 이름은 반반이 아니다', () => {
    expect(parseBanbanFlavorsFromName('Banban Chicken')).toBeNull()
    expect(parseBanbanFlavorsFromName('')).toBeNull()
    expect(parseBanbanFlavorsFromName(null)).toBeNull()
    expect(parseBanbanFlavorsFromName(undefined)).toBeNull()
  })

  it('기본명이 비어 있으면 null', () => {
    expect(parseBanbanFlavorsFromName('(A / B)')).toBeNull()
  })
})

describe('isBanbanMenu', () => {
  it('Bar.B.Q류 코드(bb-q-…)는 반반으로 보지 않는다', () => {
    expect(
      isBanbanMenu({
        isBanban: false,
        code: 'BB-Q-001',
        name: 'GUCHUJANG Bar.B.Q',
      })
    ).toBe(false)
  })

  it('이름·코드에 banban이 있으면 반반으로 본다', () => {
    expect(
      isBanbanMenu({
        isBanban: false,
        code: 'bb-banban-x',
        name: 'x',
      })
    ).toBe(true)
  })
})
