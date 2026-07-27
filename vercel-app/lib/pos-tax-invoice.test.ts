import { describe, expect, it } from 'vitest'
import {
  appendPosInternalMemoStamp,
  parsePosOrderMemo,
  shouldReprintPaymentReceiptForTaxInvoiceMemoChange,
  stripPosOrderTaxInvoiceFromMemo,
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

  it('strips ORDER_MERGED and ORDER_MERGE_KEEP from plain memo (receipt/kitchen)', () => {
    const memo =
      'customer note\n' +
      '[ORDER_MERGE_KEEP 2026-07-27T13:51:00.000Z absorb_id=57]\n' +
      '[ORDER_MERGED 2026-07-27T13:51:00.000Z keep_id=55 keep_no=055]'
    const { plainMemo } = parsePosOrderMemo(memo)
    expect(plainMemo).toBe('customer note')
    expect(plainMemo).not.toMatch(/ORDER_MERGE/)
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

  it('detects tax invoice memo changes for payment receipt reprint', () => {
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
    expect(shouldReprintPaymentReceiptForTaxInvoiceMemoChange('', upsertPosOrderTaxInvoiceMemo('', tax))).toBe(
      true
    )
    const memoWithTax = upsertPosOrderTaxInvoiceMemo('', tax)
    expect(shouldReprintPaymentReceiptForTaxInvoiceMemoChange(memoWithTax, memoWithTax)).toBe(false)
    const updated = upsertPosOrderTaxInvoiceMemo('', { ...tax, name: 'DEF' })
    expect(shouldReprintPaymentReceiptForTaxInvoiceMemoChange(memoWithTax, updated)).toBe(true)
  })

  it('stripPosOrderTaxInvoiceFromMemo removes tax block for hall/customer receipt print', () => {
    const tax = {
      memberNo: '',
      customerType: 'company' as const,
      name: 'TT Company',
      taxId: '0123456789878',
      branchNo: '00000',
      phone: '000000000',
      email: '00@mail.com',
      address: '0000',
      member: false,
    }
    const memo = upsertPosOrderTaxInvoiceMemo('note for kitchen', tax)
    expect(memo).toContain(TAX_INVOICE_MARKER)
    expect(stripPosOrderTaxInvoiceFromMemo(memo)).toBe('note for kitchen')
    expect(stripPosOrderTaxInvoiceFromMemo(memo)).not.toContain(TAX_INVOICE_MARKER)
  })
})
