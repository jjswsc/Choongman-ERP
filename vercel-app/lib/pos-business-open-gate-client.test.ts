import { describe, expect, it, vi, beforeEach } from 'vitest'
import { checkPosBusinessOpenClient } from '@/lib/pos-business-open-gate-client'

vi.mock('@/lib/api-client', () => ({
  getPosBusinessDaySettings: vi.fn(async () => ({
    hour: 10,
    minute: 0,
    endHour: 10,
    endMinute: 0,
  })),
}))

vi.mock('@/lib/offline/settlement-offline', () => ({
  getPosSettlementWithCache: vi.fn(async ({ storeCode, settleDate }: { storeCode?: string; settleDate: string }) => {
    const open =
      (storeCode === 'CM Office' || storeCode === 'Office') &&
      (settleDate === '2026-06-02' || settleDate === '2026-06-01')
    if (!open) return { settlement: null }
    return {
      settlement: {
        storeCode: storeCode || 'CM Office',
        settleDate,
        cashActual: settleDate === '2026-06-02' ? 3000 : 2000,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: false,
      },
    }
  }),
}))

describe('checkPosBusinessOpenClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('allows when opening cash exists for current business day via store alias', async () => {
    vi.setSystemTime(new Date('2026-06-02T11:00:00+07:00'))
    const result = await checkPosBusinessOpenClient({
      storeCode: 'CM Office',
      resolveStoreKey: (raw) => (raw === 'Office' ? 'CM Office' : raw),
      legacyToCanonical: { office: 'CM Office' },
      syncGlobalBusinessHours: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.blockReason).toBe('none')
    expect(result.businessDateYmd).toBe('2026-06-02')
  })

  it('reports new business day when only previous day has opening cash', async () => {
    vi.setSystemTime(new Date('2026-06-02T11:00:00+07:00'))
    const { getPosSettlementWithCache } = await import('@/lib/offline/settlement-offline')
    vi.mocked(getPosSettlementWithCache).mockImplementation(async ({ settleDate }) => {
      if (settleDate === '2026-06-01') {
        return {
          settlement: {
            storeCode: 'CM Office',
            settleDate: '2026-06-01',
            cashActual: 2000,
            cardAmt: 0,
            qrAmt: 0,
            deliveryAppAmt: 0,
            otherAmt: 0,
            memo: '',
            closed: false,
          },
        }
      }
      return { settlement: null }
    })

    const result = await checkPosBusinessOpenClient({
      storeCode: 'CM Office',
      syncGlobalBusinessHours: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.blockReason).toBe('new_business_day')
    expect(result.prevBusinessDateYmd).toBe('2026-06-01')
    expect(result.businessDateYmd).toBe('2026-06-02')
  })
})
