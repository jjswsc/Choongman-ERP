import { describe, expect, it } from 'vitest'
import { looksLikeGrabPartnerInvoiceNo, trimPurchaseTaxSellerName } from './purchase-tax-invoice-core'
import { extractPurchaseTaxInvoiceFromScanText } from './purchase-tax-invoice-scan'
import {
  PURCHASE_TAX_SCAN_BUYER_TIN,
  PURCHASE_TAX_SCAN_RULES,
  type PurchaseTaxScanRuleCase,
} from './purchase-tax-invoice-scan-rules'

function matchText(got: string | undefined, want: string | RegExp) {
  if (typeof want === 'string') expect(got).toBe(want)
  else expect(got).toMatch(want)
}

function assertRule(rule: PurchaseTaxScanRuleCase) {
  const row = extractPurchaseTaxInvoiceFromScanText(rule.text, {
    buyerTaxId: rule.buyerTaxId || PURCHASE_TAX_SCAN_BUYER_TIN,
    taxMonth: rule.taxMonth,
  })
  const e = rule.expect
  if (e.invoiceNo) expect(row?.invoiceNo, rule.id).toBe(e.invoiceNo)
  if (e.invoiceNoNot) expect(row?.invoiceNo || '', rule.id).not.toMatch(e.invoiceNoNot)
  if (e.docDate) expect(row?.docDate, rule.id).toBe(e.docDate)
  if (e.sellerName) matchText(row?.sellerName, e.sellerName)
  if (e.sellerNameNot) expect(row?.sellerName || '', rule.id).not.toMatch(e.sellerNameNot)
  if (e.sellerTaxId) expect(row?.sellerTaxId, rule.id).toBe(e.sellerTaxId)
  if (e.sellerTaxIdNot) expect(row?.sellerTaxId, rule.id).not.toBe(e.sellerTaxIdNot)
  if (e.sellerBranch) expect(row?.sellerBranch, rule.id).toBe(e.sellerBranch)
  if (e.netAmount != null) expect(row?.netAmount, rule.id).toBe(e.netAmount)
  if (e.vatAmount != null) expect(row?.vatAmount, rule.id).toBe(e.vatAmount)
}

describe('purchase tax scan rule catalog', () => {
  it('keeps one locked case per field so a one-field patch cannot empty the list', () => {
    const fields = new Set(PURCHASE_TAX_SCAN_RULES.map((r) => r.field))
    expect(PURCHASE_TAX_SCAN_RULES.length).toBeGreaterThanOrEqual(20)
    expect(fields).toEqual(new Set(['invoiceNo', 'docDate', 'sellerName', 'sellerTaxId', 'sellerBranch', 'amount']))
  })

  it('rejects Grab partner IDs before any field merge', () => {
    expect(looksLikeGrabPartnerInvoiceNo('IDTHMG20250804101630012435')).toBe(true)
    expect(looksLikeGrabPartnerInvoiceNo('IDIDTHMG20250804101630012435')).toBe(true)
    expect(looksLikeGrabPartnerInvoiceNo('IM20260801054170')).toBe(false)
  })

  it('trims HQ/copy suffix and Panfood spelling on the name helper itself', () => {
    expect(trimPurchaseTaxSellerName('บริษัท แพนฟุ้ด จำกัด (สำนักงานใหญ่) ต้นฉบับ')).toBe(
      'บริษัท แพนฟู้ด จำกัด'
    )
    expect(trimPurchaseTaxSellerName('จำภัต (สำนักงานใหญ่) ต้นฉบับ')).toBe('จำกัด')
  })

  for (const rule of PURCHASE_TAX_SCAN_RULES) {
    it(`${rule.id}: ${rule.title}`, () => {
      assertRule(rule)
    })
  }
})
