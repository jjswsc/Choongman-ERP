import { describe, expect, it } from 'vitest'
import type { PosMenuOption } from '@/lib/api-client'
import {
  findNonPreferredChickenComposeLines,
  isNonPreferredChickenPartOptionName,
  resolvePreferredChickenSetOptionId,
  resolvePromoItemOptionBinding,
} from '@/lib/pos-promo-chicken-compose-guard'

const mOpts = (rows: Partial<PosMenuOption>[]): PosMenuOption[] =>
  rows.map((r, i) => ({
    id: String(r.id ?? i + 1),
    menuId: String(r.menuId ?? '11'),
    name: r.name ?? '',
    priceModifier: r.priceModifier ?? 0,
    optionType: r.optionType ?? 'substitution',
    optionStepValues: r.optionStepValues,
    ...r,
  })) as PosMenuOption[]

describe('pos-promo-chicken-compose-guard', () => {
  it('detects drumette and wing as non-preferred parts', () => {
    expect(isNonPreferredChickenPartOptionName('M - Drumette')).toBe(true)
    expect(isNonPreferredChickenPartOptionName('M - Wing')).toBe(true)
    expect(isNonPreferredChickenPartOptionName('M - Boneless')).toBe(false)
    expect(isNonPreferredChickenPartOptionName('S Boneless')).toBe(false)
  })

  it('prefers M-Boneless when adding chicken to a set', () => {
    const opts = mOpts([
      { id: '1', name: 'M - Boneless', optionStepValues: { size: 'M', part: 'Boneless' } },
      { id: '2', name: 'M - Drumette', optionStepValues: { size: 'M', part: 'Drumette' } },
    ])
    expect(resolvePreferredChickenSetOptionId(opts)).toBe('1')
  })

  it('does not auto-pick drumette when boneless is missing', () => {
    const opts = mOpts([{ id: '2', name: 'M - Drumette' }])
    expect(resolvePreferredChickenSetOptionId(opts)).toBeNull()
  })

  it('corrects option binding via option_code snapshot', () => {
    const all = mOpts([
      { id: '99', menuId: '11', name: 'M - Drumette', optionCode: 'C011-4' },
      { id: '100', menuId: '11', name: 'M - Boneless', optionCode: 'C011-2' },
    ])
    const resolved = resolvePromoItemOptionBinding({
      menuId: '11',
      menuCode: 'C011',
      optionId: '99',
      optionCode: 'C011-2',
      allOptions: all,
    })
    expect(resolved.optionId).toBe('100')
    expect(resolved.optionLabel).toBe('M - Boneless')
    expect(resolved.corrected).toBe(true)
  })

  it('flags non-boneless chicken lines before save', () => {
    const optionById = new Map<string, PosMenuOption>()
    optionById.set('2', mOpts([{ id: '2', name: 'M - Drumette' }])[0])
    const warnings = findNonPreferredChickenComposeLines(
      [{ menuId: '11', menuCode: 'C011', menuName: 'SOY SAUCE CHICKEN', optionId: '2' }],
      optionById
    )
    expect(warnings).toEqual([{ menuName: 'SOY SAUCE CHICKEN', optionLabel: 'M - Drumette' }])
  })
})
