import { describe, expect, it } from 'vitest'
import { resolveBankPlCashVat, safePlCashVat } from '@/lib/income-statement-cash-vat'

describe('safePlCashVat', () => {
  it('returns zero for empty amount', () => {
    expect(safePlCashVat(0, 7)).toEqual({ gross: 0, vat: 0, net: 0 })
  })

  it('keeps gross when vat missing or zero', () => {
    expect(safePlCashVat(107, 0)).toEqual({ gross: 107, vat: 0, net: 107 })
    expect(safePlCashVat(107, null)).toEqual({ gross: 107, vat: 0, net: 107 })
  })

  it('subtracts explicit vat only when vat < amount', () => {
    expect(safePlCashVat(107, 7)).toEqual({ gross: 107, vat: 7, net: 100 })
  })

  it('ignores vat >= amount (no inventing net)', () => {
    expect(safePlCashVat(100, 100)).toEqual({ gross: 100, vat: 0, net: 100 })
    expect(safePlCashVat(100, 150)).toEqual({ gross: 100, vat: 0, net: 100 })
  })
})

describe('resolveBankPlCashVat', () => {
  it('prefers bank vat over accrual', () => {
    expect(
      resolveBankPlCashVat({
        bankAmount: 107,
        bankVatAmount: 7,
        accrualGross: 214,
        accrualVat: 14,
      })
    ).toEqual({ gross: 107, vat: 7, net: 100 })
  })

  it('scales accrual vat for partial bank payment when bank vat empty', () => {
    // Full accrual 107 with vat 7; half paid 53.5 → scaled vat ≈ 3.5
    const r = resolveBankPlCashVat({
      bankAmount: 53.5,
      bankVatAmount: 0,
      accrualGross: 107,
      accrualVat: 7,
    })
    expect(r.gross).toBe(53.5)
    expect(r.vat).toBe(3.5)
    expect(r.net).toBe(50)
  })

  it('does not invent vat when accrual has none', () => {
    expect(
      resolveBankPlCashVat({
        bankAmount: 100,
        bankVatAmount: null,
        accrualGross: 100,
        accrualVat: 0,
      })
    ).toEqual({ gross: 100, vat: 0, net: 100 })
  })
})
