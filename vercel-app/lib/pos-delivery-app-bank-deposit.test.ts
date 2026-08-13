import { describe, expect, it } from 'vitest'
import {
  aggregateDeliveryAppBankDeposits,
  attributedSalesDateForBankDeposit,
  inferDeliveryAppCodeFromBankText,
  isDeliveryAppBankDepositRow,
} from '@/lib/pos-delivery-app-bank-deposit'
import {
  aggregateDeliveryAppReconcileRows,
  appendBankOnlyReconcileRows,
  applyBankDepositsToReconcileRows,
  applySettledAmountsToReconcileRows,
} from '@/lib/pos-delivery-app-reconcile'

describe('inferDeliveryAppCodeFromBankText', () => {
  it('classifies Grab / LINE MAN / Shopee from memo', () => {
    expect(inferDeliveryAppCodeFromBankText('GRABTAXI (THAILAND)')).toBe('grab')
    expect(inferDeliveryAppCodeFromBankText('LINE MAN settlement')).toBe('lineman')
    expect(inferDeliveryAppCodeFromBankText('SHOPEEFOOD UNION')).toBe('shopee')
  })

  it('does not treat card or generic delivery as an app', () => {
    expect(inferDeliveryAppCodeFromBankText('VISA SETTLEMENT')).toBe('')
    expect(inferDeliveryAppCodeFromBankText('QR PromptPay')).toBe('')
    expect(inferDeliveryAppCodeFromBankText('delivery fee')).toBe('')
  })
})

describe('attributedSalesDateForBankDeposit', () => {
  it('prefers sales_date', () => {
    expect(attributedSalesDateForBankDeposit({ transDate: '2026-08-01', salesDate: '2026-07-31' })).toBe(
      '2026-07-31'
    )
  })

  it('falls back to trans_date minus one calendar day', () => {
    expect(attributedSalesDateForBankDeposit({ transDate: '2026-08-01' })).toBe('2026-07-31')
  })
})

describe('isDeliveryAppBankDepositRow', () => {
  it('keeps receivable_receive Grab deposits', () => {
    expect(
      isDeliveryAppBankDepositRow({
        transType: 'deposit',
        category: 'receivable_receive',
        memo: 'GRAB UNION MALL',
        amount: 12000,
        storeName: 'CM Union Mall',
      })
    ).toBe(true)
  })

  it('skips card deposits even if amount is present', () => {
    expect(
      isDeliveryAppBankDepositRow({
        transType: 'deposit',
        category: 'revenue_card',
        memo: 'VISA',
        amount: 5000,
        storeName: 'CM Union Mall',
      })
    ).toBe(false)
  })
})

describe('aggregateDeliveryAppBankDeposits', () => {
  it('sums Grab deposits by store using sales date in range', () => {
    const map = aggregateDeliveryAppBankDeposits({
      startStr: '2026-07-01',
      endStr: '2026-07-31',
      rows: [
        {
          transType: 'deposit',
          transDate: '2026-08-01',
          salesDate: '2026-07-31',
          memo: 'GRAB',
          amount: 800,
          storeName: 'Union Mall',
        },
        {
          transType: 'deposit',
          transDate: '2026-07-02',
          memo: 'GRABTAXI',
          amount: 200,
          storeName: 'CM Union Mall',
        },
        {
          transType: 'deposit',
          transDate: '2026-08-02',
          salesDate: '2026-08-01',
          memo: 'GRAB',
          amount: 50,
          storeName: 'CM Union Mall',
        },
      ],
    })
    const amt = [...map.values()][0]
    expect(map.size).toBe(1)
    expect(amt).toBe(1000)
  })
})

describe('applyBankDepositsToReconcileRows', () => {
  it('fills settledNet from bank when channel settlement is empty', () => {
    const base = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 1000,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
    ])
    const next = applyBankDepositsToReconcileRows(base, () => 820)
    expect(next[0].bankDepositAmt).toBe(820)
    expect(next[0].settledNet).toBe(820)
    expect(next[0].settledFee).toBeNull()
  })

  it('prefers bank deposit over channel settlement net for 결산 입금', () => {
    const base = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 1000,
        store_code: 'CM Union Mall',
        created_at: '2026-07-01 12:00:00',
      },
    ])
    const settled = applySettledAmountsToReconcileRows(base, () => ({ fee: 180, net: 799 }))
    const next = applyBankDepositsToReconcileRows(settled, () => 820)
    expect(next[0].settledFee).toBe(180)
    expect(next[0].bankDepositAmt).toBe(820)
    expect(next[0].settledNet).toBe(820)
  })
})

describe('appendBankOnlyReconcileRows', () => {
  it('adds a row when bank has an app deposit but POS has no sales', () => {
    const extra = appendBankOnlyReconcileRows([], new Map([['CM Union Mall\tgrab', 500]]))
    expect(extra).toHaveLength(1)
    expect(extra[0].storeCode).toBe('CM Union Mall')
    expect(extra[0].appCode).toBe('grab')
    expect(extra[0].suggestedPayout).toBe(0)
    expect(extra[0].bankDepositAmt).toBe(500)
    expect(extra[0].settledNet).toBe(500)
  })
})
