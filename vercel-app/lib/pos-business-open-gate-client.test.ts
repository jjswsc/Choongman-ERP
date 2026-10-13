import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  checkPosBusinessOpenClient,
  clearPosBusinessOpenStatusMemo,
} from '@/lib/pos-business-open-gate-client'

vi.mock('@/lib/api-client', () => ({
  getPosBusinessDaySettings: vi.fn(async () => ({
    hour: 10,
    minute: 0,
    endHour: 10,
    endMinute: 0,
  })),
  getPosBusinessOpenStatus: vi.fn(async () => ({ success: false })),
  getPosSettlement: vi.fn(async () => ({ settlement: null })),
}))

vi.mock('@/lib/pos-business-open-local', () => ({
  readPosBusinessOpenLocal: vi.fn(() => false),
}))

vi.mock('@/lib/offline/cache', () => ({
  getFromCache: vi.fn(async () => null),
}))

vi.mock('@/lib/offline/network', () => ({
  isOnline: vi.fn(() => true),
  shouldPreferOfflineCache: vi.fn(() => false),
}))

vi.mock('@/lib/offline/settlement-offline', () => ({
  settlementStoreCacheKeys: vi.fn(() => []),
  persistPosBusinessOpenAfterSave: vi.fn(async () => {}),
  resolvePosBusinessOpenSettleDates: vi.fn((ymd: string) => [ymd]),
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
    clearPosBusinessOpenStatusMemo()
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

  it('locally opened day checks close status with one light open-status call, not the settlement API', async () => {
    vi.setSystemTime(new Date('2026-06-02T11:00:00+07:00'))
    const api = await import('@/lib/api-client')
    const local = await import('@/lib/pos-business-open-local')
    const offline = await import('@/lib/offline/settlement-offline')
    vi.mocked(local.readPosBusinessOpenLocal).mockReturnValue(true)
    vi.mocked(api.getPosBusinessOpenStatus).mockResolvedValue({
      success: true,
      allowed: true,
      blockReason: 'none',
      settlementClosed: false,
    })
    vi.mocked(api.getPosSettlement).mockClear()
    vi.mocked(api.getPosBusinessOpenStatus).mockClear()
    vi.mocked(offline.getPosSettlementWithCache).mockClear()

    const first = await checkPosBusinessOpenClient({
      storeCode: 'CM The Street',
      syncGlobalBusinessHours: false,
    })
    const second = await checkPosBusinessOpenClient({
      storeCode: 'CM The Street',
      syncGlobalBusinessHours: false,
    })

    expect(first).toMatchObject({ allowed: true, settlementClosed: false })
    expect(second).toMatchObject({ allowed: true, settlementClosed: false })
    expect(api.getPosBusinessOpenStatus).toHaveBeenCalledTimes(1)
    expect(api.getPosSettlement).not.toHaveBeenCalled()
    expect(offline.getPosSettlementWithCache).not.toHaveBeenCalled()
  })

  it('still reports settlement closed from the light open-status call', async () => {
    vi.setSystemTime(new Date('2026-06-02T11:00:00+07:00'))
    const api = await import('@/lib/api-client')
    const local = await import('@/lib/pos-business-open-local')
    vi.mocked(local.readPosBusinessOpenLocal).mockReturnValue(true)
    vi.mocked(api.getPosBusinessOpenStatus).mockResolvedValue({
      success: true,
      allowed: true,
      blockReason: 'none',
      settlementClosed: true,
    })

    const result = await checkPosBusinessOpenClient({
      storeCode: 'CM The Street',
      syncGlobalBusinessHours: false,
    })
    expect(result).toMatchObject({ allowed: true, settlementClosed: true })
  })

  it('falls back to the settlement API when the light open-status call fails', async () => {
    vi.setSystemTime(new Date('2026-06-02T11:00:00+07:00'))
    const api = await import('@/lib/api-client')
    const local = await import('@/lib/pos-business-open-local')
    const offline = await import('@/lib/offline/settlement-offline')
    vi.mocked(local.readPosBusinessOpenLocal).mockReturnValue(true)
    vi.mocked(api.getPosBusinessOpenStatus).mockRejectedValue(new Error('network'))
    vi.mocked(offline.getPosSettlementWithCache).mockResolvedValue({
      settlement: {
        storeCode: 'CM The Street',
        settleDate: '2026-06-02',
        cashActual: 3000,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: true,
      },
    } as never)

    const result = await checkPosBusinessOpenClient({
      storeCode: 'CM The Street',
      syncGlobalBusinessHours: false,
    })
    expect(result).toMatchObject({ allowed: true, settlementClosed: true })
  })
})
