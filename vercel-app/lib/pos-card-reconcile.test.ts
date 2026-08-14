import { describe, expect, it } from 'vitest'
import {
  aggregateCardBankDeposits,
  aggregateCardReconcileRows,
  applyCardBankDepositsToRows,
  buildCardReconcileResult,
} from '@/lib/pos-card-reconcile'

describe('aggregateCardReconcileRows', () => {
  it('sums payment_card by store for completed orders only', () => {
    const rows = aggregateCardReconcileRows([
      {
        store_code: 'CT001',
        status: 'paid',
        payment_card: 100,
        created_at: '2026-08-13T10:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'completed',
        payment_card: 50.5,
        created_at: '2026-08-13T11:00:00+07:00',
      },
      {
        store_code: 'CT001',
        status: 'pending',
        payment_card: 999,
        created_at: '2026-08-13T12:00:00+07:00',
      },
      {
        store_code: 'CT002',
        status: 'paid',
        payment_card: 0,
        created_at: '2026-08-13T10:00:00+07:00',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.storeCode).toBe('CM CT001')
    expect(rows[0]?.orderCount).toBe(2)
    expect(rows[0]?.cardSales).toBe(150.5)
  })
})

describe('aggregateCardBankDeposits', () => {
  it('sums 4120–4124 on sales date and matches the same calendar day as POS', () => {
    const pos = aggregateCardReconcileRows([
      {
        store_code: 'CM Ekkamai',
        status: 'paid',
        payment_card: 1000,
        created_at: '2026-08-06T10:00:00+07:00',
      },
    ])
    const bank = aggregateCardBankDeposits({
      startStr: '2026-08-06',
      endStr: '2026-08-07',
      storeCodes: ['CM Ekkamai'],
      rows: [
        {
          transType: 'deposit',
          transDate: '2026-08-07',
          salesDate: '2026-08-06',
          accountSubjectCode: '4121',
          amount: 980,
          accountStore: 'CM Ekkamai',
        },
        {
          transType: 'deposit',
          transDate: '2026-08-08',
          salesDate: '2026-08-07',
          accountSubjectCode: '4120',
          amount: 50,
          accountStore: 'CM Ekkamai',
        },
        {
          transType: 'deposit',
          transDate: '2026-08-07',
          salesDate: '2026-08-06',
          accountSubjectCode: '4130',
          amount: 9000,
          accountStore: 'CM Ekkamai',
        },
      ],
    })
    const rows = applyCardBankDepositsToRows(pos, bank)
    const store = rows.find((r) => r.storeCode.includes('Ekkamai'))
    expect(store?.cardSales).toBe(1000)
    expect(store?.bankDepositAmt).toBe(1030)
    expect(store?.days.map((d) => d.date)).toEqual(['2026-08-06', '2026-08-07'])
    expect(store?.days[0]).toMatchObject({ date: '2026-08-06', cardSales: 1000, bankDepositAmt: 980 })
    expect(store?.days[1]).toMatchObject({ date: '2026-08-07', cardSales: 0, bankDepositAmt: 50 })
    expect(buildCardReconcileResult(rows).kpi.bankDepositAmt).toBe(1030)
  })
})
