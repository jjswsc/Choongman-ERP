import { describe, expect, it } from 'vitest'
import { upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'
import {
  buildPosHallOrderReceiptDocumentHtml,
  mergeSetChildrenForReceipt,
} from '@/lib/pos-hall-order-receipt-document-html'

type MergeSetTestItem = {
  id: string
  name: string
  price?: number
  qty: number
  promoId?: string
  promoCode?: string
}

describe('mergeSetChildrenForReceipt', () => {
  it('merges children by shared promoCode when bracket child markers are missing', () => {
    const rows = mergeSetChildrenForReceipt([
      { id: 'p1', name: '[April] Set 3', qty: 1, promoId: '3', promoCode: '260457-S03' },
      { id: 'c1', name: 'PEPSI MEGA 1', qty: 1, promoCode: '260457-S03' },
      { id: 'c2', name: 'PEPSI MEGA 2', qty: 1, promoCode: '260457-S03' },
    ] satisfies MergeSetTestItem[])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toContain('Set 3')
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      'PEPSI MEGA 1',
      'PEPSI MEGA 2',
    ])
  })
})

describe('buildPosHallOrderReceiptDocumentHtml', () => {
  it('prefixes add-on order lines with > before item name', () => {
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '009',
        storeCode: 'CM Union Mall',
        orderType: 'dine-in',
        tableName: 'T5',
        items: [
          { id: '1', name: 'Banban Chicken', price: 239, qty: 1 },
          { id: '2', name: 'Squid Ring', price: 130, qty: 1, isAddon: true },
        ],
        subtotal: 369,
        discountAmt: 0,
        total: 369,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('1x Banban Chicken')
    expect(html).toContain('1x &gt; Squid Ring')
    expect(html).not.toContain('1x &gt; Banban Chicken')
  })

  it('does not print internal memo stamps inside tax invoice address', () => {
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
    const html = buildPosHallOrderReceiptDocumentHtml({
      payload: {
        orderNo: '001',
        storeCode: 'CM Union Mall',
        orderType: 'dine-in',
        memo,
        items: [{ id: '1', name: '7UP', price: 30, qty: 1 }],
        subtotal: 30,
        discountAmt: 0,
        total: 30,
      },
      t: (k) => k,
      lang: 'en',
    })
    expect(html).toContain('Bangkok')
    expect(html).not.toContain('ORDER_CANCELLED')
    expect(html).not.toContain('PAY_CORRECT')
  })
})
