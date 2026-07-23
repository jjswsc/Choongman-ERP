import { describe, expect, it } from 'vitest'
import {
  buildCheckoutPaymentReceiptModalData,
  enrichPosOrderLikeItemsWithPromoSnapshot,
  mergePartialPromoSnapshotWithCatalog,
  receiptModalDataFromPosOrderForPayment,
  receiptModalDataFromPosOrderReprint,
} from '@/lib/pos-payment-receipt-from-order'
import type { PosOrder, PosPromoWithItems } from '@/lib/api-client'
import { posPricingAdjustmentsFromPrinterSettings } from '@/lib/pos-pricing'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import { upsertPosOrderTaxInvoiceMemo } from '@/lib/pos-tax-invoice'

describe('buildCheckoutPaymentReceiptModalData', () => {
  it('includes coupon line discounts in summary discount and total', () => {
    const receipt = buildCheckoutPaymentReceiptModalData({
      orderNo: 'ST01-TEST',
      storeCode: 'ST01',
      orderType: 'dine_in',
      tableName: '2',
      items: [
        { id: '1', name: 'GOLDEN FRIED CHICKEN', price: 219, quantity: 1, lineDiscountAmt: 172.06 },
        { id: '2', name: 'Banban Chicken', price: 259, quantity: 1, lineDiscountAmt: 50.94 },
      ],
      discountAmt: 94,
      couponDiscountAmt: 0,
      appliedCoupons: [
        { code: 'CPN1', name: 'Coupon 1', discountAmt: 172.06, quantity: 1 },
        { code: 'CPN2', name: 'Coupon 2', discountAmt: 50.94, quantity: 1 },
      ],
      paymentSum: 255,
      adjustments: {},
    })

    expect(receipt.discountAmt).toBe(223)
    expect(receipt.total).toBe(255)
    expect(receipt.appliedCoupons).toHaveLength(2)
    expect(receipt.items?.[0]?.lineDiscountAmt).toBe(172.06)
  })
})

describe('receiptModalDataFromPosOrderReprint', () => {
  it('matches payment receipt fees (service + VAT) so reprint is not rounding-only', () => {
    const order = {
      id: 1,
      orderNo: '1001-20260723-013',
      storeCode: 'ST01',
      orderType: 'dine_in',
      tableName: '3',
      status: 'paid',
      items: [{ id: '1', name: 'Mama', price: 69, quantity: 1 }],
      subtotal: 69,
      discountAmt: 0,
      total: 81,
      vat: 5.31,
      paymentCash: 81,
      paymentCard: 0,
      paymentQr: 0,
      paymentOther: 0,
      paymentDeliveryApp: 0,
    } as unknown as PosOrder

    const adjustments = posPricingAdjustmentsFromPrinterSettings({
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
      paymentTotalRoundingMode: 'round',
    })

    const payment = receiptModalDataFromPosOrderForPayment(order, adjustments)
    const reprint = receiptModalDataFromPosOrderReprint(order, undefined, adjustments)

    expect(reprint.serviceFeeAmt).toBe(payment.serviceFeeAmt)
    expect(reprint.serviceFeeAmt).toBeGreaterThan(0.01)
    expect(reprint.vatFeeAmt).toBe(payment.vatFeeAmt)
    expect(reprint.vatFeeMode).toBe(payment.vatFeeMode)
    expect(reprint.total).toBe(payment.total)
    expect(reprint.suppressReceiptModalAutoPrint).toBe(true)
  })

  it('prints tax invoice box and hides service charge row on tax invoice reprint', () => {
    const memo = upsertPosOrderTaxInvoiceMemo('', {
      memberNo: '',
      customerType: 'company',
      name: 'Test Co',
      taxId: '0123456789222',
      branchNo: '00000',
      phone: '0147782510',
      email: 'mail@mail.com',
      address: 'Test',
      member: false,
    })
    const order = {
      id: 2,
      orderNo: '1001-20260723-013',
      storeCode: 'ST01',
      orderType: 'dine_in',
      tableName: '3',
      status: 'paid',
      items: [{ id: '1', name: 'Mama', price: 69, quantity: 1 }],
      subtotal: 69,
      discountAmt: 0,
      total: 81,
      vat: 5.31,
      paymentCash: 81,
      memo,
    } as unknown as PosOrder

    const adjustments = posPricingAdjustmentsFromPrinterSettings({
      vatRate: 7,
      vatMode: 'separate',
      serviceRate: 10,
      serviceMode: 'separate',
    })
    const reprint = receiptModalDataFromPosOrderReprint(order, undefined, adjustments)
    expect(reprint.serviceFeeAmt).toBeGreaterThan(0.01)

    const html = buildPosPaymentReceiptDocumentHtml({
      receiptData: reprint,
      menus: [],
      orderTypeLabels: { dine_in: 'Dine-in', takeout: 'Takeout', delivery: 'Delivery' },
      t: (k: string) => k,
      lang: 'en',
      origin: '',
      printedAt: new Date('2026-07-23T08:58:00Z'),
      printerSettings: {
        vatRate: 7,
        serviceRate: 10,
        receiptBizName: 'XIONG LAO HAN',
        receiptBizTaxId: '0105562142456',
      },
      forceSimpleTextMode: false,
    })

    expect(html).toContain('Test Co')
    expect(html).toContain('0123456789222')
    expect(html).not.toMatch(/Service Charge/i)
    expect(html).not.toContain('posReceiptServiceCharge')
  })
})

describe('mergePartialPromoSnapshotWithCatalog', () => {
  it('fills missing set components from catalog when snapshot is partial', () => {
    const snapshot = [{ menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' }]
    const catalog = [
      { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
      { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN', optionName: 'S Boneless' },
      { menuId: '4', optionId: null, quantity: 1, menuName: 'KIMCHI SOUP With Rice' },
    ]
    expect(mergePartialPromoSnapshotWithCatalog(snapshot, catalog)).toHaveLength(3)
  })
})

describe('enrichPosOrderLikeItemsWithPromoSnapshot partial set', () => {
  it('merges partial promoItems with catalog template for receipt print', () => {
    const promoCatalogById = new Map<string, PosPromoWithItems>([
      [
        '99',
        {
          id: '99',
          code: 'SET3',
          name: '[Super Deal] Set 3',
          items: [
            { menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' },
            { menuId: '2', optionId: '3', quantity: 1, menuName: 'CURRY Bar.B.Q FRIED CHICKEN' },
            { menuId: '4', optionId: null, quantity: 1, menuName: 'KIMCHI SOUP With Rice' },
          ],
        } as PosPromoWithItems,
      ],
    ])
    const enriched = enrichPosOrderLikeItemsWithPromoSnapshot(
      [
        {
          id: 'set-line',
          name: '[Super Deal] Set 3',
          promoId: '99',
          promoItems: [{ menuId: '1', optionId: null, quantity: 1, menuName: 'Rice' }],
        },
      ],
      { promoCatalogById, menus: [] }
    )
    expect((enriched[0] as { promoItems?: unknown[] }).promoItems).toHaveLength(3)
  })
})
