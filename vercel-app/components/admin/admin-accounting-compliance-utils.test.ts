import { describe, expect, it } from 'vitest'
import {
  mergeWhtAmountPatch,
  shouldShowPnd353RdPrepTxtDownload,
  withheldFromGrossAndRate,
} from './admin-accounting-compliance-utils'

describe('withheldFromGrossAndRate', () => {
  it('matches PND.3 rent/service examples', () => {
    expect(withheldFromGrossAndRate('170000', '5')).toBe('8500')
    expect(withheldFromGrossAndRate('5000', '0.9')).toBe('45')
  })

  it('recalculates withheld when gross or rate changes', () => {
    const row = { gross_amount: '1000', wht_rate: '3', wht_amount: '30', payee_name: 'A' }
    expect(mergeWhtAmountPatch(row, { gross_amount: '2000' }).wht_amount).toBe('60')
    expect(mergeWhtAmountPatch(row, { wht_rate: '5' }).wht_amount).toBe('50')
    expect(mergeWhtAmountPatch(row, { wht_amount: '12' }).wht_amount).toBe('12')
  })
})

describe('shouldShowPnd353RdPrepTxtDownload', () => {
  const whtBase = {
    pp30Mode: 'wht_only',
    showPnd1Area: false,
    showPnd353Tools: true,
    isPnd5354CompactList: false,
    pnd5354SubView: 'pnd53' as const,
  }

  it('shows TXT on dedicated PND.3 and PND.53 tabs', () => {
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd53' })).toBe(true)
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd3' })).toBe(true)
  })

  it('shows TXT on legacy combined 53/54 tab when 53 is selected', () => {
    expect(
      shouldShowPnd353RdPrepTxtDownload({
        ...whtBase,
        whtFocusMode: 'pnd5354',
        isPnd5354CompactList: true,
        pnd5354SubView: 'pnd53',
      })
    ).toBe(true)
    expect(
      shouldShowPnd353RdPrepTxtDownload({
        ...whtBase,
        whtFocusMode: 'pnd5354',
        isPnd5354CompactList: true,
        pnd5354SubView: 'pnd54',
      })
    ).toBe(false)
  })

  it('hides TXT on PND.1 / PP.30 / PND.54 tabs', () => {
    expect(
      shouldShowPnd353RdPrepTxtDownload({ ...whtBase, showPnd1Area: true, whtFocusMode: 'pnd1' })
    ).toBe(false)
    expect(
      shouldShowPnd353RdPrepTxtDownload({ ...whtBase, pp30Mode: 'vat_only', whtFocusMode: 'pnd53' })
    ).toBe(false)
    expect(shouldShowPnd353RdPrepTxtDownload({ ...whtBase, whtFocusMode: 'pnd54' })).toBe(false)
  })
})
