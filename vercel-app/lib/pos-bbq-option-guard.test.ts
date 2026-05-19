import { describe, expect, it } from 'vitest'
import {
  normalizeBbqChickenOptionSelectionGroups,
  validateBbqOptionSelectionGroups,
  validateStrictBonelessBbqOption,
} from '@/lib/pos-bbq-option-guard'

describe('pos-bbq-option-guard', () => {
  it('allows sidedish-only groups for BBQ codes', () => {
    expect(validateBbqOptionSelectionGroups('C020', ['sidedish'])).toEqual({ ok: true })
    expect(normalizeBbqChickenOptionSelectionGroups(['sidedish', 'part', 'size'])).toEqual([
      'sidedish',
    ])
  })

  it('rejects size/part selection groups', () => {
    const res = validateBbqOptionSelectionGroups('C023', ['part', 'sidedish'])
    expect(res.ok).toBe(false)
  })

  it('still blocks wing options', () => {
    const res = validateStrictBonelessBbqOption({
      menuCode: 'C020',
      optionType: 'substitution',
      optionName: 'M - Wing',
    })
    expect(res.ok).toBe(false)
  })
})
