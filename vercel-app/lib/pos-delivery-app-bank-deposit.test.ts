import { describe, expect, it } from 'vitest'
import {
  aggregateDeliveryAppBankDeposits,
  attributedSalesDateForBankDeposit,
  inferDeliveryAppCodeFromBankText,
  isDeliveryAppBankDepositRow,
  resolveDeliveryAppFromBankRow,
} from '@/lib/pos-delivery-app-bank-deposit'
import {
  isChannelReconcileDayMismatch,
} from '@/lib/pos-channel-reconcile-match'
import {
  aggregateDeliveryAppReconcileRows,
  appendBankOnlyReconcileRows,
  applyBankDepositsToReconcileRows,
  applySettledAmountsToReconcileRows,
} from '@/lib/pos-delivery-app-reconcile'

describe('inferDeliveryAppCodeFromBankText', () => {
  it('classifies Grab / LINE MAN / Shopee from memo', () => {
    expect(inferDeliveryAppCodeFromBankText('GRABTAXI (THAILAND)')).toBe('grab')
    expect(inferDeliveryAppCodeFromBankText('이체입금 | X3812 GRABFOOD')).toBe('grab')
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

  it('keeps 배달앱정산 (revenue_delivery) classified by 4111 even without grab in memo', () => {
    expect(
      isDeliveryAppBankDepositRow({
        transType: 'deposit',
        category: 'revenue_delivery',
        memo: '이체입금 | X3812',
        accountSubjectCode: '4111',
        amount: 422.41,
        storeName: 'CM Future Park',
      })
    ).toBe(true)
    expect(
      resolveDeliveryAppFromBankRow({
        memo: '이체입금 | X3812',
        accountSubjectCode: '4111',
      })
    ).toBe('grab')
  })
})

describe('aggregateDeliveryAppBankDeposits', () => {
  it('sums Grab deposits by store using sales date in range', () => {
    const agg = aggregateDeliveryAppBankDeposits({
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
    const amt = [...agg.byStoreApp.values()][0]
    expect(agg.byStoreApp.size).toBe(1)
    expect(amt).toBe(1000)
    expect(agg.byStoreAppDate.size).toBe(2)
    expect([...agg.byStoreAppDate.values()].sort((a, b) => a - b)).toEqual([200, 800])
  })

  it('attributes empty store_name deposits to the store bank account via GL 4111', () => {
    const agg = aggregateDeliveryAppBankDeposits({
      startStr: '2026-08-01',
      endStr: '2026-08-13',
      storeCodes: ['CM Ekkamai'],
      rows: [
        {
          transType: 'deposit',
          transDate: '2026-08-07',
          salesDate: '2026-08-06',
          accountSubjectCode: '4111',
          amount: 179945,
          storeName: '',
          accountStore: 'CM Ekkamai',
        },
        {
          transType: 'deposit',
          transDate: '2026-08-07',
          salesDate: '2026-08-06',
          accountSubjectCode: '4111',
          amount: 500000,
          storeName: '',
          accountStore: 'CM Union Mall',
        },
      ],
    })
    expect(agg.byStoreApp.get('CM Ekkamai\tgrab')).toBe(179945)
    expect(agg.byStoreApp.size).toBe(1)
    expect(agg.byStoreAppDate.get('CM Ekkamai\tgrab\t2026-08-06')).toBe(179945)
  })

  it('uses store column or memo store mention when store_name is empty', () => {
    const agg = aggregateDeliveryAppBankDeposits({
      startStr: '2026-08-01',
      endStr: '2026-08-13',
      storeCodes: ['CM Ekkamai', 'CM Future Park'],
      rows: [
        {
          transType: 'deposit',
          transDate: '2026-08-07',
          salesDate: '2026-08-06',
          category: 'revenue_delivery',
          memo: '이체입금 | X3812 GRABFOOD',
          accountSubjectCode: '4111',
          amount: 422.41,
          storeName: '',
          store: 'CM Future Park',
        },
        {
          transType: 'deposit',
          transDate: '2026-08-08',
          salesDate: '2026-08-07',
          category: 'revenue_delivery',
          memo: 'GRABFOOD EKKAMAI',
          accountSubjectCode: '4111',
          amount: 100,
          storeName: '',
        },
      ],
    })
    expect(agg.byStoreApp.get('CM Future Park\tgrab')).toBe(422.41)
    expect(agg.byStoreApp.get('CM Ekkamai\tgrab')).toBe(100)
    expect(agg.byStoreAppDate.get('CM Future Park\tgrab\t2026-08-06')).toBe(422.41)
    expect(agg.byStoreAppDate.get('CM Ekkamai\tgrab\t2026-08-07')).toBe(100)
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

describe('isChannelReconcileDayMismatch', () => {
  it('flags the same calendar date when POS and bank differ by 1 THB or more', () => {
    expect(isChannelReconcileDayMismatch(800, 800)).toBe(false)
    expect(isChannelReconcileDayMismatch(800, 800.4)).toBe(false)
    expect(isChannelReconcileDayMismatch(800, 799)).toBe(true)
    expect(isChannelReconcileDayMismatch(800, null)).toBe(true)
    expect(isChannelReconcileDayMismatch(0, 100)).toBe(true)
    expect(isChannelReconcileDayMismatch(0, null)).toBe(false)
  })
})

describe('date-level POS vs bank matching', () => {
  it('matches bank deposits to the same sales date and keeps bank-only dates', () => {
    const base = aggregateDeliveryAppReconcileRows([
      {
        status: 'paid',
        order_type: 'delivery',
        delivery_app_code: 'grab',
        total: 1000,
        store_code: 'CM Ekkamai',
        created_at: '2026-08-06 12:00:00',
      },
    ])
    const remainingDates = new Map([
      ['CM Ekkamai\tgrab\t2026-08-06', 800],
      ['CM Ekkamai\tgrab\t2026-08-07', 100],
    ])
    const next = applyBankDepositsToReconcileRows(base, () => 900, remainingDates)
    expect(next[0].bankDepositAmt).toBe(900)
    expect(next[0].days).toHaveLength(2)
    const d6 = next[0].days.find((d) => d.date === '2026-08-06')
    const d7 = next[0].days.find((d) => d.date === '2026-08-07')
    expect(d6?.bankDepositAmt).toBe(800)
    expect(d6?.suggestedPayout).toBe(next[0].suggestedPayout)
    expect(d7?.deliverySales).toBe(0)
    expect(d7?.bankDepositAmt).toBe(100)
    expect(d7?.suggestedPayout).toBe(0)
  })
})
