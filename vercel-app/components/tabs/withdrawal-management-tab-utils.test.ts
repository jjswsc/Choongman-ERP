import { describe, expect, it } from 'vitest'
import { categoryUsesAccountSubjectPicker } from './withdrawal-management-tab-utils'

describe('categoryUsesAccountSubjectPicker', () => {
  it('keeps account subject for expense, fixed asset, and general transfer', () => {
    expect(categoryUsesAccountSubjectPicker('expense')).toBe(true)
    expect(categoryUsesAccountSubjectPicker('fixed_asset')).toBe(true)
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_general')).toBe(true)
  })

  it('clears account subject for purchase and other transfer kinds', () => {
    expect(categoryUsesAccountSubjectPicker('purchase')).toBe(false)
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_to_petty')).toBe(false)
    expect(categoryUsesAccountSubjectPicker('transfer', 'bank_to_card')).toBe(false)
    expect(categoryUsesAccountSubjectPicker('tax')).toBe(false)
  })
})
