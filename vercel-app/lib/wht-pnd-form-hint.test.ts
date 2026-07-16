import { describe, expect, it } from 'vitest'
import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

describe('resolveWhtPndFormHint', () => {
  it('uses PND53 for registered juristic persons (Co., Ltd.)', () => {
    expect(resolveWhtPndFormHint({ payeeName: 'Polonext Co., Ltd.', incomeType: 'ค่าบริการ' })).toBe(
      'PND53'
    )
    expect(resolveWhtPndFormHint({ payeeName: 'บริษัท ทดสอบ จำกัด', incomeType: 'ค่าบริการ' })).toBe('PND53')
  })

  it('uses PND3 for natural persons', () => {
    expect(resolveWhtPndFormHint({ payeeName: 'นายสมชาย ใจดี', incomeType: 'ค่าบริการ' })).toBe('PND3')
    expect(resolveWhtPndFormHint({ payeeName: 'John Doe', incomeType: 'freelance' })).toBe('PND3')
  })

  it('respects manual form_hint override', () => {
    expect(
      resolveWhtPndFormHint({
        payeeName: 'Polonext Co., Ltd.',
        manualHint: 'PND3',
      })
    ).toBe('PND3')
    expect(
      resolveWhtPndFormHint({
        payeeName: 'นายสมชาย',
        manualHint: 'PND53',
      })
    ).toBe('PND53')
  })
})
