import { describe, expect, it } from 'vitest'
import {
  CODE_AUTO_MAINS,
  POS_MENU_CODE_PREFIX_BY_MAIN,
  allocatePosMenuCodePrefix,
  computeNextPosMenuCode,
  ensureCodePrefixesForMains,
  posMenuCodePlaceholderForMain,
  posMenuCodePrefixForMain,
  remapCodePrefixesOnMainRename,
  supportsPosMenuAutoCode,
} from '@/lib/pos-menu-next-code'

describe('pos-menu-next-code', () => {
  it('Food → F, placeholder F001', () => {
    expect(posMenuCodePrefixForMain('Food')).toBe('F')
    expect(posMenuCodePlaceholderForMain('Food')).toBe('F001')
    expect(CODE_AUTO_MAINS).toContain('Food')
    expect(POS_MENU_CODE_PREFIX_BY_MAIN.Food).toBe('F')
  })

  it('기존 대분류 접두사 유지', () => {
    expect(posMenuCodePrefixForMain('Chicken')).toBe('C')
    expect(posMenuCodePrefixForMain('Topping')).toBe('T')
    expect(posMenuCodePrefixForMain('')).toBeNull()
  })

  it('Bibimbap → BC, placeholder BC001', () => {
    expect(posMenuCodePrefixForMain('Bibimbap')).toBe('BC')
    expect(posMenuCodePlaceholderForMain('Bibimbap')).toBe('BC001')
    expect(CODE_AUTO_MAINS).toContain('Bibimbap')
  })

  it('supportsPosMenuAutoCode: 빈값만 false', () => {
    expect(supportsPosMenuAutoCode('')).toBe(false)
    expect(supportsPosMenuAutoCode('  ')).toBe(false)
    expect(supportsPosMenuAutoCode('Soup')).toBe(true)
    expect(supportsPosMenuAutoCode('비빔밥')).toBe(true)
  })

  it('신규 라틴 대분류는 글자 접두사, 시드와 충돌 시 다른 후보', () => {
    const used = new Set(Object.values(POS_MENU_CODE_PREFIX_BY_MAIN).map((p) => p.toUpperCase()))
    // S 는 Side 시드가 사용 중 → Soup 은 SO 등
    const soup = allocatePosMenuCodePrefix('Soup', used)
    expect(soup).toMatch(/^[A-Z]+$/)
    expect(soup).not.toBe('S')
    expect(used.has(soup)).toBe(false)

    used.add(soup)
    const salad = allocatePosMenuCodePrefix('Salad', used)
    expect(salad).not.toBe(soup)
    expect(salad).not.toBe('S')
  })

  it('비라틴 대분류도 접두사 할당', () => {
    const used = new Set(['C', 'K', 'S', 'D', 'T', 'F', 'BC', 'PM'])
    const p = allocatePosMenuCodePrefix('비빔밥특선', used)
    expect(p).toMatch(/^[A-Z]+$/)
    expect(used.has(p)).toBe(false)
  })

  it('ensureCodePrefixesForMains: 시드+신규 채움, 기존 맵 유지', () => {
    const { codePrefixByMain, changed } = ensureCodePrefixesForMains(
      ['Chicken', 'Dessert'],
      { Chicken: 'C' },
      ['Noodles']
    )
    expect(changed).toBe(true)
    expect(codePrefixByMain.Chicken).toBe('C')
    expect(codePrefixByMain.Dessert).toMatch(/^[A-Z]+$/)
    expect(codePrefixByMain.Noodles).toMatch(/^[A-Z]+$/)
    expect(codePrefixByMain.Dessert).not.toBe(codePrefixByMain.Noodles)
  })

  it('computeNextPosMenuCode: 최대+1, 3자리', () => {
    expect(computeNextPosMenuCode('BC', ['BC001', 'bc003', 'X001'])).toBe('BC004')
    expect(computeNextPosMenuCode('C', [])).toBe('C001')
  })

  it('remapCodePrefixesOnMainRename', () => {
    const next = remapCodePrefixesOnMainRename({ Soup: 'SO', Chicken: 'C' }, [['Soup', 'HotSoup']])
    expect(next.HotSoup).toBe('SO')
    expect(next.Soup).toBeUndefined()
    expect(next.Chicken).toBe('C')
  })
})
