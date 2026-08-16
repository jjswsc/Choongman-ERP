import { describe, expect, it } from 'vitest'
import {
  bankDepositRecognitionDate,
  bankQrDepositDate,
  channelReconcilePosCalendarDate,
  defaultBankDepositSalesDate,
  defaultBankDepositSalesDateForRow,
  filterRowsByChannelReconcileCalendarRange,
  isSameDayBankDepositSalesDate,
} from '@/lib/pos-channel-reconcile-match'

describe('bankDepositRecognitionDate', () => {
  it('uses sales_date (통장 인식일) when set', () => {
    expect(
      bankDepositRecognitionDate({ transDate: '2026-08-01', salesDate: '2026-07-28' })
    ).toBe('2026-07-28')
  })

  it('falls back to deposit date minus one calendar day', () => {
    expect(bankDepositRecognitionDate({ transDate: '2026-08-01' })).toBe('2026-07-31')
    expect(bankDepositRecognitionDate({ transDate: '2026-03-01' })).toBe('2026-02-28')
  })
})

describe('bankQrDepositDate', () => {
  it('uses deposit date and ignores stored recognition date', () => {
    expect(bankQrDepositDate({ transDate: '2026-07-03' })).toBe('2026-07-03')
  })
})

describe('channelReconcilePosCalendarDate', () => {
  it('prefers paid_at Bangkok calendar day over created_at', () => {
    expect(
      channelReconcilePosCalendarDate({
        paid_at: '2026-08-07T01:15:00+07:00',
        created_at: '2026-08-06T22:00:00+07:00',
      })
    ).toBe('2026-08-07')
  })

  it('uses created_at when paid_at is missing', () => {
    expect(
      channelReconcilePosCalendarDate({
        created_at: '2026-08-06T22:00:00+07:00',
      })
    ).toBe('2026-08-06')
  })
})

describe('filterRowsByChannelReconcileCalendarRange', () => {
  it('keeps rows whose payment calendar day is in range', () => {
    const rows = filterRowsByChannelReconcileCalendarRange(
      [
        { paid_at: '2026-07-31T23:30:00+07:00' },
        { paid_at: '2026-08-01T00:15:00+07:00' },
        { paid_at: '2026-08-02T10:00:00+07:00' },
      ],
      '2026-08-01',
      '2026-08-01'
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.paid_at).toContain('2026-08-01')
  })
})

describe('defaultBankDepositSalesDate', () => {
  it('defaults to deposit minus one day, or same day for QR', () => {
    expect(defaultBankDepositSalesDate('2026-08-01')).toBe('2026-07-31')
    expect(defaultBankDepositSalesDate('2026-08-01', { sameDay: true })).toBe('2026-08-01')
    expect(isSameDayBankDepositSalesDate({ category: 'revenue_qr' })).toBe(true)
    expect(isSameDayBankDepositSalesDate({ accountSubjectCode: '4130' })).toBe(true)
    expect(isSameDayBankDepositSalesDate({ category: 'revenue_card' })).toBe(false)
    expect(
      defaultBankDepositSalesDateForRow({ transDate: '2026-08-01', category: 'revenue_qr' })
    ).toBe('2026-08-01')
    expect(
      defaultBankDepositSalesDateForRow({ transDate: '2026-08-01', category: 'revenue_card' })
    ).toBe('2026-07-31')
  })
})
