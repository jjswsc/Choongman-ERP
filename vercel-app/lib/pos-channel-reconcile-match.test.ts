import { describe, expect, it } from 'vitest'
import { bankDepositRecognitionDate } from '@/lib/pos-channel-reconcile-match'

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
