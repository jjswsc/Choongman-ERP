import { describe, expect, it } from 'vitest'
import {
  PND1_INCOME_40_1_GENERAL,
  PND1_INCOME_40_1_PCT3,
  stripIncomeTypeTaxRate,
  toPnd1IncomeTypeLabel,
} from './pnd-rd-income-type'

describe('stripIncomeTypeTaxRate', () => {
  it('keeps ประเภทเงินได้ and drops a trailing percent', () => {
    expect(stripIncomeTypeTaxRate('ค่าบริการ 3%')).toBe('ค่าบริการ')
    expect(stripIncomeTypeTaxRate('ค่าเช่า 5.0%')).toBe('ค่าเช่า')
    expect(stripIncomeTypeTaxRate('ค่าบริการ')).toBe('ค่าบริการ')
  })
})

describe('toPnd1IncomeTypeLabel', () => {
  it('maps payroll salary to มาตรา 40(1) กรณีทั่วไป', () => {
    expect(toPnd1IncomeTypeLabel('급여', 0)).toBe(PND1_INCOME_40_1_GENERAL)
    expect(toPnd1IncomeTypeLabel('เงินเดือน', 1.2)).toBe(PND1_INCOME_40_1_GENERAL)
  })

  it('maps 3% withholding salary to RD Prep item 2', () => {
    expect(toPnd1IncomeTypeLabel('급여', 3)).toBe(PND1_INCOME_40_1_PCT3)
    expect(toPnd1IncomeTypeLabel('เงินเดือน', 3.0)).toBe(PND1_INCOME_40_1_PCT3)
  })

  it('does not append a tax rate to the มาตรา text', () => {
    expect(toPnd1IncomeTypeLabel('급여 3%', 3)).toBe(PND1_INCOME_40_1_PCT3)
    expect(toPnd1IncomeTypeLabel(PND1_INCOME_40_1_GENERAL, 0)).toBe(PND1_INCOME_40_1_GENERAL)
  })
})
