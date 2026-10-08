import { describe, expect, it } from 'vitest'
import { parsePaymentOtherBreakdown, sumPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import {
  accumulatePosOrderPaymentSales,
  collectPosPaymentTenderLabels,
  sortPosPaymentSalesRows,
} from '@/lib/pos-payment-tender-labels'

const tr = (key: string, fallback: string) => {
  const map: Record<string, string> = {
    posPaymentCash: 'Cash',
    posPaymentCard: 'Card',
    posPaymentQrCode: 'QR',
    posPaymentOther: 'Other',
    posPaymentWeChat: 'WeChat',
    posPaymentAlipay: 'Alipay',
    posPaymentTrueMoney: 'TrueMoney',
    salesPayCredit: 'Credit',
    salesPayQrPromptPay: 'QR PromptPay',
  }
  return map[key] || fallback
}

describe('payment tender labels', () => {
  it('prints WeChat instead of Other when the other line is WeChat', () => {
    const labels = collectPosPaymentTenderLabels(
      {
        paymentOther: 75,
        paymentOtherBreakdown: { admin: { '12': 75 }, adminLabels: { '12': 'WeChat' } },
      },
      tr
    )
    expect(labels).toEqual(['WeChat'])
    expect(labels).not.toContain('Other')
  })

  it('keeps admin labels out of the other total', () => {
    const parsed = parsePaymentOtherBreakdown({
      admin: { '12': 75 },
      adminLabels: { '12': 'WeChat' },
    })
    expect(sumPaymentOtherBreakdown(parsed)).toBe(75)
    expect(parsed?.adminLabels).toEqual({ '12': 'WeChat' })
  })

  it('lists Credit and QR PromptPay on the receipt list', () => {
    const labels = collectPosPaymentTenderLabels(
      { paymentCash: 10, paymentCard: 20, paymentQr: 30 },
      tr,
      null,
      'list'
    )
    expect(labels).toEqual(['Cash', 'Credit', 'QR PromptPay'])
  })

  it('splits sales into WeChat, Alipay, and TrueMoney', () => {
    const rows = sortPosPaymentSalesRows(
      accumulatePosOrderPaymentSales(
        [
          {
            payment_cash: 347,
            payment_other: 75,
            payment_other_breakdown: { weChat: 75 },
          },
          {
            payment_other: 40,
            payment_other_breakdown: { admin: { '9': 40 }, adminLabels: { '9': 'Alipay' } },
          },
          {
            payment_qr: 16,
            payment_other: 10,
            payment_other_breakdown: { trueMoney: 10 },
          },
        ],
        { '9': 'Alipay' }
      )
    )
    expect(rows.map((r) => r.label || r.paymentKey)).toEqual([
      'cash',
      'qr',
      'Alipay',
      'other_wechat',
      'other_truemoney',
    ])
  })
})
