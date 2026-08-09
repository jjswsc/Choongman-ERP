import { describe, expect, it } from 'vitest'
import {
  MAIN_POS_HEAD_POLL_HEALTHY_RECHECK_MS,
  MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS,
  MAIN_POS_POLL_INTERVAL_DEGRADED_MS,
  MAIN_POS_POLL_INTERVAL_HEALTHY_ACTIVE_MS,
  MAIN_POS_POLL_INTERVAL_HEALTHY_MS,
  isMainPosRealtimeInsertChannelHealthy,
  isMainPosRealtimeRecentlyActive,
  resolveMainPosHeadPollIntervalMs,
  resolveMainPosHeadPollSchedule,
  resolveMainPosPollIntervalMs,
  shouldUseMainPosHeavyOrderScanFallback,
} from '@/lib/pos-main-poll-interval'

describe('pos-main-poll-interval', () => {
  it('uses longer interval when channel ok and recent events (realtime primary)', () => {
    expect(
      resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: true,
        realtimeRecentlyActive: true,
      })
    ).toBe(MAIN_POS_POLL_INTERVAL_HEALTHY_ACTIVE_MS)
  })

  it('treats healthy when any insert channel is subscribed despite alias errors', () => {
    const states = new Map<string, string>([
      ['insert:CM Silom', 'SUBSCRIBED'],
      ['insert-items:CM Silom', 'SUBSCRIBED'],
      ['insert:1042', 'TIMED_OUT'],
      ['insert-items:1042', 'CHANNEL_ERROR'],
    ])
    expect(isMainPosRealtimeInsertChannelHealthy(states)).toBe(true)
  })

  it('unhealthy when no insert channel subscribed', () => {
    const states = new Map<string, string>([
      ['insert:CM Silom', 'TIMED_OUT'],
      ['insert-items:CM Silom', 'SUBSCRIBED'],
    ])
    expect(isMainPosRealtimeInsertChannelHealthy(states)).toBe(false)
  })

  it('uses healthy interval when channel ok even without recent order events', () => {
    expect(
      resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: true,
        realtimeRecentlyActive: false,
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

  it('skips head API when realtime healthy; fetches only when degraded', () => {
    expect(MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS).toBeGreaterThanOrEqual(30_000)
    expect(resolveMainPosHeadPollSchedule({ realtimeChannelHealthy: true })).toEqual({
      delayMs: MAIN_POS_HEAD_POLL_HEALTHY_RECHECK_MS,
      fetch: false,
    })
    expect(resolveMainPosHeadPollSchedule({ realtimeChannelHealthy: false })).toEqual({
      delayMs: MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS,
      fetch: true,
    })
    expect(resolveMainPosHeadPollIntervalMs({ realtimeChannelHealthy: true })).toBeNull()
    expect(resolveMainPosHeadPollIntervalMs({ realtimeChannelHealthy: false })).toBe(
      MAIN_POS_HEAD_POLL_INTERVAL_DEGRADED_MS
    )
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
