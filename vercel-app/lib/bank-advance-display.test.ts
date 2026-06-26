import { describe, expect, it } from 'vitest'
import {
  classifyBankAdvanceTarget,
  decodeBankAdvanceSelectValue,
  encodeBankAdvanceSelectValue,
  formatBankAdvanceAccountSubjectLabel,
  resolveBankAdvanceTargetLabel,
  resolvePrepaymentAccountSubject,
} from '@/lib/bank-advance-display'

describe('bank-advance-display', () => {
  it('resolves prepayment account by code 1160', () => {
    const subject = resolvePrepaymentAccountSubject([
      { id: 9, code: '5520', name: '기타경비' },
      { id: 3, code: '1160', name: '선급금', nameEn: 'Prepayments' },
    ])
    expect(subject?.code).toBe('1160')
  })

  it('classifies store, vendor, and card targets', () => {
    expect(classifyBankAdvanceTarget({ storeName: 'CM Ekkamai' })).toBe('store')
    expect(classifyBankAdvanceTarget({ vendorCode: 'V001' })).toBe('vendor')
    expect(classifyBankAdvanceTarget({ vendorCode: 'card_12' })).toBe('card')
  })

  it('encodes and decodes select values', () => {
    expect(encodeBankAdvanceSelectValue({ storeName: 'CM Ekkamai', vendorCode: '' })).toBe('store:CM Ekkamai')
    expect(decodeBankAdvanceSelectValue('vendor:V001')).toEqual({ storeName: '', vendorCode: 'V001' })
  })

  it('formats account subject label with target', () => {
    const label = formatBankAdvanceAccountSubjectLabel(
      { code: '1160', name: '선급금' },
      '매장: CM Ekkamai'
    )
    expect(label).toBe('1160 선급금 · 매장: CM Ekkamai')
  })

  it('resolves card target label', () => {
    const label = resolveBankAdvanceTargetLabel({
      vendorCode: 'card_5',
      cardAccounts: [{ id: 5, name: 'KB Corporate' }],
      cardLabel: '카드',
    })
    expect(label).toBe('카드: KB Corporate')
  })
})
