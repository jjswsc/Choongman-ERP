import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseSelectFilterMock = vi.fn()
const resolvePosStoreFilterCandidatesMock = vi.fn()
const loadPosBusinessHoursForServerMock = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  supabaseSelectFilter: (...args: unknown[]) => supabaseSelectFilterMock(...args),
}))

vi.mock('@/lib/pos-store-filter-candidates', () => ({
  resolvePosStoreFilterCandidates: (...args: unknown[]) =>
    resolvePosStoreFilterCandidatesMock(...args),
}))

vi.mock('@/lib/pos-business-day-server', () => ({
  loadPosBusinessHoursForServer: (...args: unknown[]) => loadPosBusinessHoursForServerMock(...args),
}))

import {
  assertPosBusinessOpenForExistingOrderSave,
  assertPosBusinessOpenForOrderSave,
} from '@/lib/pos-business-open-gate-server'

describe('assertPosBusinessOpenForOrderSave', () => {
  beforeEach(() => {
    supabaseSelectFilterMock.mockReset()
    resolvePosStoreFilterCandidatesMock.mockReset()
    loadPosBusinessHoursForServerMock.mockResolvedValue({
      start: { hour: 10, minute: 0 },
      end: { hour: 10, minute: 0 },
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00+07:00'))
  })

  it('allows Grab merchant store_code when opening cash is on linked partner code', async () => {
    resolvePosStoreFilterCandidatesMock.mockResolvedValue(['GFSBPOS-sima', '1040'])
    supabaseSelectFilterMock.mockImplementation(async (_table: string, filter: string) => {
      if (filter.includes('GFSBPOS-sima')) return []
      if (filter.includes('1040')) return [{ cash_actual: 2000 }]
      return []
    })

    const result = await assertPosBusinessOpenForOrderSave('GFSBPOS-sima')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.businessDateYmd).toBe('2026-06-05')
    }
  })

  it('rejects when no linked store has opening cash', async () => {
    resolvePosStoreFilterCandidatesMock.mockResolvedValue(['GFSBPOS-sima', '1040'])
    supabaseSelectFilterMock.mockResolvedValue([])

    const result = await assertPosBusinessOpenForOrderSave('GFSBPOS-sima')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('pos_business_open_required')
    }
  })

  it('falls back to terminal store when order and terminal share linked candidates', async () => {
    resolvePosStoreFilterCandidatesMock.mockImplementation(async (store: string) => {
      if (store === 'GFSBPOS-sima') return ['GFSBPOS-sima', '1042']
      if (store === '1042') return ['1042', 'CM Silom']
      return [store]
    })
    supabaseSelectFilterMock.mockImplementation(async (_table: string, filter: string) => {
      if (filter.includes('GFSBPOS-sima')) return []
      if (filter.includes('1042')) return [{ cash_actual: 1500 }]
      return []
    })

    const result = await assertPosBusinessOpenForExistingOrderSave({
      orderStoreCode: 'GFSBPOS-sima',
      terminalStoreCode: '1042',
    })
    expect(result.ok).toBe(true)
  })
})
