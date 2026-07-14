import { describe, expect, it } from 'vitest'
import {
  buildBankLinkedPayablePaymentMemo,
  buildPettyLinkedPayablePaymentMemo,
} from './receivable-payable'

describe('buildBankLinkedPayablePaymentMemo', () => {
  it('prefers bank memo over expense fallback', () => {
    expect(
      buildBankLinkedPayablePaymentMemo({
        bankMemo: 'มัดจำSauce Pouch Snow Onion',
        fallbackDetail: '지출 지급(Sombatchai Plastic Industry Ltd.)',
      })
    ).toBe('통장 지급: มัดจำSauce Pouch Snow Onion')
  })

  it('falls back when bank memo empty', () => {
    expect(
      buildBankLinkedPayablePaymentMemo({
        bankMemo: '  ',
        fallbackDetail: '지출 지급(Vendor)',
      })
    ).toBe('통장 지급: 지출 지급(Vendor)')
  })
})

describe('buildPettyLinkedPayablePaymentMemo', () => {
  it('prefixes petty detail', () => {
    expect(buildPettyLinkedPayablePaymentMemo('지출 지급(A)')).toBe('패티 지급: 지출 지급(A)')
  })
})
