import { describe, expect, it } from 'vitest'
import {
  bankNoteUserDisplayText,
  composeBankNoteForExpenseAccrualLink,
  composeBankNoteWithCategoryAndOptionalAccrualPrefix,
  stripExpenseAccrualPrefix,
} from '@/lib/bank-transaction-note-meta'

describe('bankNoteUserDisplayText', () => {
  it('strips expense_accrual_id prefix and withdrawal_category tag', () => {
    expect(
      bankNoteUserDisplayText('expense_accrual_id:1234;Pretty Cashs logis | withdrawal_category:expense')
    ).toBe('Pretty Cashs logis')
    expect(bankNoteUserDisplayText('expense_accrual_id:99;withdrawal_category:expense')).toBe('')
    expect(bankNoteUserDisplayText('Office rent | withdrawal_category:fixed')).toBe('Office rent')
  })
})

describe('composeBankNoteForExpenseAccrualLink', () => {
  it('preserves existing user memo when linking', () => {
    expect(
      composeBankNoteForExpenseAccrualLink('Pretty Cashs logis', 42, 'expense')
    ).toBe('expense_accrual_id:42;Pretty Cashs logis | withdrawal_category:expense')
  })

  it('does not wipe user memo already stored with category meta', () => {
    expect(
      composeBankNoteForExpenseAccrualLink(
        'SSO 06/2026 | withdrawal_category:expense',
        88,
        'expense'
      )
    ).toBe('expense_accrual_id:88;SSO 06/2026 | withdrawal_category:expense')
  })

  it('keeps metadata-only when there was no user memo', () => {
    expect(composeBankNoteForExpenseAccrualLink('', 7, 'expense')).toBe(
      'expense_accrual_id:7;withdrawal_category:expense'
    )
  })
})

describe('composeBankNoteWithCategoryAndOptionalAccrualPrefix', () => {
  it('re-applies accrual prefix while saving user display text', () => {
    const existing = 'expense_accrual_id:5;old | withdrawal_category:expense'
    expect(composeBankNoteWithCategoryAndOptionalAccrualPrefix(existing, 'new memo', 'expense')).toBe(
      'expense_accrual_id:5;new memo | withdrawal_category:expense'
    )
    expect(stripExpenseAccrualPrefix(existing)).toContain('old')
  })
})
