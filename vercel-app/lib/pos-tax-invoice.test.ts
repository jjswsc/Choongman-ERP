import { describe, expect, it } from 'vitest'
import {
  appendPosInternalMemoStamp,
  parsePosOrderMemo,
  TAX_INVOICE_MARKER,
  upsertPosOrderTaxInvoiceMemo,
} from '@/lib/pos-tax-invoice'

describe('parsePosOrderMemo', () => {
  it('strips PAY_CORRECT and ORDER_CANCELLED stamps from plain memo', () => {
    const memo =
      '[PAY_CORRECT 2026-05-22T08:36:56.308Z MU003] clicked wrong\n' +
      '[ORDER_CANCELLED 2026-05-22T08:39:34.240Z] test'
    const { plainMemo, taxInvoice } = parsePosOrderMemo(memo)
    expect(plainMemo).toBe('')
    expect(taxInvoice).toBeNull()
  })

  it('does not merge ORDER_CANCELLED into tax invoice address when stamp was appended after block', () => {
    const tax = {
      memberNo: '',
      customerType: 'person' as const,
      name: 'ABC',
      taxId: '1234567890123',
      branchNo: '00000',
      phone: '0987654321',
      email: 'a@b.com',
      address: 'Bangkok',
      member: false,
    }
    const memo =
      upsertPosOrderTaxInvoiceMemo('', tax) +
      '\n[ORDER_CANCELLED 2026-05-22T08:39:34.240Z] pressed wrong'
    const { taxInvoice } = parsePosOrderMemo(memo)
    expect(taxInvoice?.address).toBe('Bangkok')
    expect(taxInvoice?.address).not.toMatch(/ORDER_CANCELLED/)
  })

  it('appendPosInternalMemoStamp inserts before TAX_INVOICE block', () => {
    const tax = {
      memberNo: '',
      customerType: 'person' as const,
      name: 'A',
      taxId: '1234567890123',
      branchNo: '00000',
      phone: '0987654321',
      email: '',
      address: 'Addr',
      member: false,
    }
    const base = upsertPosOrderTaxInvoiceMemo('', tax)
    const next = appendPosInternalMemoStamp(base, '[ORDER_CANCELLED 2026-05-22T08:39:34.240Z] x')
    expect(next.indexOf('[ORDER_CANCELLED')).toBeLessThan(next.indexOf(TAX_INVOICE_MARKER))
    expect(parsePosOrderMemo(next).taxInvoice?.address).toBe('Addr')
  })

  it('keeps customer memo and parses tax invoice after internal stamps', () => {
    const tax = {
      memberNo: '',
      customerType: 'person' as const,
      name: 'Phuwadet Munphanklang',
      taxId: '1234567890123',
      branchNo: '00000',
      phone: '0987654321',
      email: 'aaa28@gmail.com',
      address: 'Bangkok',
      member: false,
    }
    const memo = upsertPosOrderTaxInvoiceMemo(
      '[PAY_CORRECT 2026-05-22T08:36:56.308Z] wrong | customer note',
      tax
    )
    const { plainMemo, taxInvoice } = parsePosOrderMemo(memo)
    expect(plainMemo).toBe('customer note')
    expect(taxInvoice?.name).toBe('Phuwadet Munphanklang')
    expect(taxInvoice?.phone).toBe('0987654321')
    expect(memo).toContain(TAX_INVOICE_MARKER)
  })
})
