import { describe, expect, it } from 'vitest'
import {
  bankCategoryForWithdrawalCategory,
  bankNoteUserDisplayText,
  composeBankNoteForExpenseAccrualLink,
  composeBankNoteWithCategoryAndOptionalAccrualPrefix,
  defaultTaxRemittancePayeeName,
  looksLikeSsoRemittanceMemo,
  looksLikeTaxAuthorityRemittanceMemo,
  shouldExcludeBankWithdrawFromPlExpense,
  stripExpenseAccrualPrefix,
} from '@/lib/bank-transaction-note-meta'
import { suggestWithdrawFromMemo } from '@/lib/suggest-withdraw-from-memo'

describe('bankNoteUserDisplayText', () => {
  it('strips expense_accrual_id prefix and withdrawal_category tag', () => {
    expect(
      bankNoteUserDisplayText('expense_accrual_id:1234;Pretty Cashs logis | withdrawal_category:expense')
    ).toBe('Pretty Cashs logis')
    expect(bankNoteUserDisplayText('expense_accrual_id:99;withdrawal_category:expense')).toBe('')
    expect(bankNoteUserDisplayText('Office rent | withdrawal_category:fixed')).toBe('Office rent')
  })

  it('strips expense_internal source marker', () => {
    expect(
      bankNoteUserDisplayText('PP.30 07.69 | withdrawal_category:tax_vat;source:expense_internal')
    ).toBe('PP.30 07.69')
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

describe('shouldExcludeBankWithdrawFromPlExpense', () => {
  it('excludes expense_internal tax settlement rows', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'expense_accrual_id:1;withdrawal_category:tax_vat;source:expense_internal',
        memo: 'ภ.พ.30 06/2026',
        category: 'unclassified',
      })
    ).toBe(true)
  })

  it('includes expense_internal fee rows with fee account subject ids', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense(
        {
          note: 'withdrawal_category:expense;source:expense_internal',
          memo: 'Delivery App fee 2026-07 - Grab',
          category: 'expense',
          account_subject_id: 128,
          vendor_code: 'GRAB_FEE',
        },
        { feeAccountSubjectIds: new Set([128]) }
      )
    ).toBe(false)
  })

  it('still excludes expense_internal general expense even with account subject', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense(
        {
          note: 'withdrawal_category:expense;source:expense_internal',
          memo: 'Office rent',
          category: 'expense',
          account_subject_id: 99,
        },
        { feeAccountSubjectIds: new Set([128, 129]) }
      )
    ).toBe(true)
  })

  it('includes expense_internal fee vendor even without subject id', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'withdrawal_category:expense;source:expense_internal',
        memo: 'Card fee',
        category: 'expense',
        vendor_code: 'CARD_FEE',
      })
    ).toBe(false)
  })

  it('still excludes expense_internal transfer/shadow without expense classification', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'withdrawal_category:transfer;source:expense_internal',
        memo: 'internal transfer',
        category: 'transfer',
      })
    ).toBe(true)
  })

  it('excludes tax_vat settlement even without internal marker', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'expense_accrual_id:1;withdrawal_category:tax_vat',
        memo: 'VAT pay',
      })
    ).toBe(true)
  })

  it('excludes bank category tax from P&L even without withdrawal_category tag', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: null,
        memo: 'RD remittance',
        category: 'tax',
      })
    ).toBe(true)
  })

  it('excludes fixed_asset withdrawals from P&L expense', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'withdrawal_category:fixed_asset',
        memo: 'Pizza oven',
        category: 'expense',
      })
    ).toBe(true)
  })

  it('excludes revenue-department remittance memos', () => {
    expect(
      looksLikeTaxAuthorityRemittanceMemo('Payment | Paid for Ref X8126 REVENUE DEPARTMENT')
    ).toBe(true)
    expect(looksLikeTaxAuthorityRemittanceMemo('PND.53 08/2026')).toBe(true)
    expect(looksLikeTaxAuthorityRemittanceMemo('PP.30 07.69')).toBe(true)
    expect(defaultTaxRemittancePayeeName('PND.53', '원천세')).toBe('กรมสรรพากร')
    expect(defaultTaxRemittancePayeeName('office rent', '원천세')).toBe('원천세')
    expect(looksLikeSsoRemittanceMemo('ประกันสังคม 08/2569')).toBe(true)
    expect(looksLikeSsoRemittanceMemo('SSO 06/2026')).toBe(true)
    expect(defaultTaxRemittancePayeeName('ประกันสังคม 08/2569', '사회보험')).toBe('สำนักงานประกันสังคม')
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: null,
        memo: 'Payment | Paid for Ref X8126 REVENUE DEPARTMENT',
      })
    ).toBe(true)
  })

  it('keeps ordinary expense withdrawals', () => {
    expect(
      shouldExcludeBankWithdrawFromPlExpense({
        note: 'expense_accrual_id:9;withdrawal_category:expense',
        memo: 'Office supplies',
      })
    ).toBe(false)
  })
})

describe('suggestWithdrawFromMemo tax remittance', () => {
  it('suggests tax for ภ.พ.30 / revenue dept / PND.53', () => {
    expect(suggestWithdrawFromMemo('ภ.พ.30 06/2026', []).category).toBe('tax')
    expect(suggestWithdrawFromMemo('PP.30 07.69', []).category).toBe('tax')
    expect(
      suggestWithdrawFromMemo('Payment | Paid for Ref X8126 REVENUE DEPARTMENT', []).category
    ).toBe('tax')
    expect(suggestWithdrawFromMemo('PND.53 withholding Aug 2026', []).category).toBe('tax')
    expect(suggestWithdrawFromMemo('ประกันสังคม 08/2569', []).category).toBe('tax')
    expect(suggestWithdrawFromMemo('SSO 06/2026', []).category).toBe('tax')
  })

  it('still suggests 5510 for generic tax fees', () => {
    expect(
      suggestWithdrawFromMemo('tax stamp fee', [{ id: 99, code: '5510' }])
    ).toEqual({ category: 'expense', accountSubjectId: 99 })
  })
})

describe('bankCategoryForWithdrawalCategory', () => {
  it('maps tax settlements to bank category tax so the expense-link button stays visible', () => {
    expect(bankCategoryForWithdrawalCategory('tax_withholding')).toBe('tax')
    expect(bankCategoryForWithdrawalCategory('tax_vat')).toBe('tax')
    expect(bankCategoryForWithdrawalCategory('tax_corporate')).toBe('tax')
    expect(bankCategoryForWithdrawalCategory('tax_sso')).toBe('tax')
    expect(bankCategoryForWithdrawalCategory('expense')).toBeNull()
  })
})
