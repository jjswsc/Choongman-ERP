import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPosBusinessDaySettings,
  invalidatePosBusinessDaySettingsClientInflight,
} from '@/lib/api-client/pos-orders'

describe('pos business day settings client cache', () => {
  beforeEach(() => {
    invalidatePosBusinessDaySettingsClientInflight()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          hour: 10,
          minute: 0,
          endHour: 10,
          endMinute: 0,
          scope: 'org_default',
        }),
      }))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    invalidatePosBusinessDaySettingsClientInflight()
  })

  it('reuses memory cache within TTL', async () => {
    await getPosBusinessDaySettings('store-a')
    await getPosBusinessDaySettings('store-a')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches after invalidate', async () => {
    await getPosBusinessDaySettings('store-a')
    invalidatePosBusinessDaySettingsClientInflight()
    await getPosBusinessDaySettings('store-a')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
