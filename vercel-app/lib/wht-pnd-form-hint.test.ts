import { describe, expect, it } from 'vitest'
import { classifyThaiTinForPnd, resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

describe('resolveWhtPndFormHint', () => {
  it('uses PND53 for registered juristic persons (Co., Ltd.)', () => {
    expect(resolveWhtPndFormHint({ payeeName: 'Polonext Co., Ltd.', incomeType: 'ค่าบริการ' })).toBe(
      'PND53'
    )
    expect(resolveWhtPndFormHint({ payeeName: 'บริษัท ทดสอบ จำกัด', incomeType: 'ค่าบริการ' })).toBe('PND53')
    expect(resolveWhtPndFormHint({ payeeName: 'บจก. จี.ซี.เอส. เซลส์ แอนด์ เซอร์วิส', incomeType: 'ค่าบริการ' })).toBe(
      'PND53'
    )
    expect(resolveWhtPndFormHint({ payeeName: 'บจก.ไอ สไตล์ พริ้นติ้ง', incomeType: 'ค่าบริการ' })).toBe('PND53')
  })

  it('uses PND3 for natural persons', () => {
    expect(resolveWhtPndFormHint({ payeeName: 'นายสมชาย ใจดี', incomeType: 'ค่าบริการ' })).toBe('PND3')
    expect(resolveWhtPndFormHint({ payeeName: 'John Doe', incomeType: 'freelance' })).toBe('PND3')
  })

  it('uses PND3 for Thai personal names without title (บุคคลธรรมดา)', () => {
    expect(
      resolveWhtPndFormHint({
        payeeName: 'รักษา วิจิตรโสภาพันธ์',
        incomeType: 'ค่าบริการ',
        payeeTaxId: '3101800833583',
      })
    ).toBe('PND3')
    expect(resolveWhtPndFormHint({ payeeName: 'สมชาย ใจดี', incomeType: 'ค่าบริการ' })).toBe('PND3')
  })

  it('uses citizen TIN (1–8) as PND3 and DBD TIN (0…) as PND53', () => {
    expect(classifyThaiTinForPnd('3101800833583')).toBe('PND3')
    expect(classifyThaiTinForPnd('0105561000000')).toBe('PND53')
    expect(
      resolveWhtPndFormHint({
        payeeName: 'Unknown Vendor',
        payeeTaxId: '3101800833583',
      })
    ).toBe('PND3')
    expect(
      resolveWhtPndFormHint({
        payeeName: 'Unknown Vendor',
        payeeTaxId: '0105561000000',
      })
    ).toBe('PND53')
  })

  it('prefers DBD TIN over Thai-script natural-person heuristic (법인 상호 without บริษัท)', () => {
    expect(
      resolveWhtPndFormHint({
        payeeName: 'ไอ สไตล์ พริ้นติ้ง',
        incomeType: 'ค่าบริการ',
        payeeTaxId: '0105551234567',
      })
    ).toBe('PND53')
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
