import { describe, expect, it } from 'vitest'
import { parseBanbanFlavorsFromName } from './pos-banban-utils'

describe('parseBanbanFlavorsFromName', () => {
  it('기본 패턴 "Base (A / B)" 두 가지 맛을 분리한다', () => {
    expect(parseBanbanFlavorsFromName('Banban Chicken (S 순살 / M 순살)')).toEqual({
      baseName: 'Banban Chicken',
      flavor1: 'S 순살',
      flavor2: 'M 순살',
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
