import { describe, expect, it } from 'vitest'
import {
  MAIN_POS_POLL_INTERVAL_DEGRADED_MS,
  MAIN_POS_POLL_INTERVAL_HEALTHY_MS,
  isMainPosRealtimeRecentlyActive,
  resolveMainPosPollIntervalMs,
  shouldUseMainPosHeavyOrderScanFallback,
} from '@/lib/pos-main-poll-interval'

describe('pos-main-poll-interval', () => {
  it('uses healthy interval when channel ok and recent events', () => {
    expect(
      resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: true,
        realtimeRecentlyActive: true,
      })
    ).toBe(MAIN_POS_POLL_INTERVAL_HEALTHY_MS)
  })

  it('uses degraded interval when channel unhealthy', () => {
    expect(
      resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: false,
        realtimeRecentlyActive: true,
      })
    ).toBe(MAIN_POS_POLL_INTERVAL_DEGRADED_MS)
  })

  it('uses degraded interval when no recent realtime activity', () => {
    expect(
      resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: true,
        realtimeRecentlyActive: false,
      })
    ).toBe(MAIN_POS_POLL_INTERVAL_DEGRADED_MS)
  })

  it('detects stale realtime by last event time', () => {
    const now = 1_000_000
    expect(isMainPosRealtimeRecentlyActive(now - 30_000, now)).toBe(true)
    expect(isMainPosRealtimeRecentlyActive(now - 120_000, now)).toBe(false)
    expect(isMainPosRealtimeRecentlyActive(0, now)).toBe(false)
  })

  it('skips heavy order scan fallback when realtime is healthy and recent', () => {
    const now = 1_000_000
    expect(
      shouldUseMainPosHeavyOrderScanFallback({
        realtimeChannelHealthy: true,
        lastRealtimeOrderEventAtMs: now - 30_000,
        nowMs: now,
      })
    ).toBe(false)
    expect(
      shouldUseMainPosHeavyOrderScanFallback({
        realtimeChannelHealthy: false,
        lastRealtimeOrderEventAtMs: now - 30_000,
        nowMs: now,
      })
    ).toBe(true)
    expect(
      shouldUseMainPosHeavyOrderScanFallback({
        realtimeChannelHealthy: true,
        lastRealtimeOrderEventAtMs: now - 120_000,
        nowMs: now,
      })
    ).toBe(true)
  })
})
