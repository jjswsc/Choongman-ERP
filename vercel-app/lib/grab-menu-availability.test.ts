import { describe, expect, it } from 'vitest'
import type { PosDeliveryMenuPolicy } from '@/lib/pos-delivery-policy'
import {
  grabAvailabilityAction,
  grabItemAvailabilityStatus,
  hasGrabDailySellWindow,
  isGrabInvalidMerchantError,
  parseGrabAvailabilityRecord,
  selectGrabAvailabilityWork,
  shouldSkipGrabItemAvailabilityStore,
} from '@/lib/grab-menu-availability'

function policy(patch: Partial<PosDeliveryMenuPolicy> = {}): PosDeliveryMenuPolicy {
  return {
    storeCode: 'CM Silom',
    appCode: 'grab',
    menuId: 10,
    enabled: true,
    sortOrder: 0,
    sellStartTime: '09:00',
    sellEndTime: '13:50',
    stockQty: null,
    soldOut: false,
    autoStopOnZero: true,
    ...patch,
  }
}

/** 2026-11-09 14:30 Asia/Bangkok */
const AT_1430_BKK = new Date('2026-11-09T07:30:00.000Z')
/** 2026-11-09 10:00 Asia/Bangkok */
const AT_1000_BKK = new Date('2026-11-09T03:00:00.000Z')
/** 2026-11-09 13:50 Asia/Bangkok — 종료 시각은 포함 */
const AT_1350_BKK = new Date('2026-11-09T06:50:00.000Z')

describe('grabItemAvailabilityStatus', () => {
  it('closes the item after the Bangkok sell end', () => {
    expect(grabItemAvailabilityStatus(policy(), AT_1430_BKK)).toBe('UNAVAILABLE')
  })

  it('keeps the item open inside the window, including the end minute', () => {
    expect(grabItemAvailabilityStatus(policy(), AT_1000_BKK)).toBe('AVAILABLE')
    expect(grabItemAvailabilityStatus(policy(), AT_1350_BKK)).toBe('AVAILABLE')
  })

  it('sold-out checkbox closes the item even inside the window', () => {
    expect(grabItemAvailabilityStatus(policy({ soldOut: true }), AT_1000_BKK)).toBe('UNAVAILABLE')
  })

  it('disabled use checkbox closes the item', () => {
    expect(grabItemAvailabilityStatus(policy({ enabled: false }), AT_1000_BKK)).toBe('UNAVAILABLE')
  })

  it('empty stock does not close the item', () => {
    expect(
      grabItemAvailabilityStatus(policy({ sellStartTime: null, sellEndTime: null, stockQty: null }), AT_1430_BKK)
    ).toBe('AVAILABLE')
  })
})

describe('hasGrabDailySellWindow', () => {
  it('requires both HH:mm values', () => {
    expect(hasGrabDailySellWindow(policy())).toBe(true)
    expect(hasGrabDailySellWindow(policy({ sellEndTime: null }))).toBe(false)
    expect(hasGrabDailySellWindow(policy({ sellEndTime: '1:50 PM' }))).toBe(false)
  })
})

describe('grabAvailabilityAction', () => {
  it('does not PUT an open item that was never pushed', () => {
    expect(grabAvailabilityAction({ desired: 'AVAILABLE', record: null })).toBe('remember-available')
  })

  it('PUTs a closed item that was never pushed', () => {
    expect(grabAvailabilityAction({ desired: 'UNAVAILABLE', record: null })).toBe('push')
  })

  it('skips when the last successful push already matches', () => {
    expect(
      grabAvailabilityAction({
        desired: 'UNAVAILABLE',
        record: { status: 'UNAVAILABLE', ok: true },
      })
    ).toBe('noop')
  })

  it('retries a failed push', () => {
    expect(
      grabAvailabilityAction({
        desired: 'UNAVAILABLE',
        record: { status: 'UNAVAILABLE', ok: false },
      })
    ).toBe('push')
  })

  it('cron waits 15 minutes before retrying a failed push', () => {
    const now = new Date('2026-11-09T07:30:00.000Z')
    expect(
      grabAvailabilityAction({
        desired: 'UNAVAILABLE',
        record: { status: 'UNAVAILABLE', ok: false, at: '2026-11-09T07:28:00.000Z' },
        now,
        retryFailed: false,
      })
    ).toBe('noop')
    expect(
      grabAvailabilityAction({
        desired: 'UNAVAILABLE',
        record: { status: 'UNAVAILABLE', ok: false, at: '2026-11-09T07:00:00.000Z' },
        now,
        retryFailed: false,
      })
    ).toBe('push')
  })
})

describe('shouldSkipGrabItemAvailabilityStore', () => {
  it('skips HQ warehouse and TEST dummy stores', () => {
    expect(shouldSkipGrabItemAvailabilityStore('CM Office')).toBe(true)
    expect(shouldSkipGrabItemAvailabilityStore('Office')).toBe(true)
    expect(shouldSkipGrabItemAvailabilityStore('TEST')).toBe(true)
    expect(shouldSkipGrabItemAvailabilityStore('CM TEST')).toBe(true)
    expect(shouldSkipGrabItemAvailabilityStore('')).toBe(true)
  })

  it('keeps real Grab outlets', () => {
    expect(shouldSkipGrabItemAvailabilityStore('CM Silom')).toBe(false)
    expect(shouldSkipGrabItemAvailabilityStore('CM Phuket')).toBe(false)
  })
})

describe('isGrabInvalidMerchantError', () => {
  it('detects Grab InvalidMerchantID responses', () => {
    expect(
      isGrabInvalidMerchantError(
        new Error('Grab API error: 400 {"target":"InvalidMerchantID","message":"failed to get store info"}')
      )
    ).toBe(true)
    expect(isGrabInvalidMerchantError(new Error('Grab API error: 404 not found'))).toBe(false)
  })
})

describe('selectGrabAvailabilityWork', () => {
  it('closes an item that is already outside its window when nothing else changed', () => {
    const closed = policy()
    const work = selectGrabAvailabilityWork({
      previous: [closed],
      next: [closed],
      records: {},
      now: AT_1430_BKK,
    })
    expect(work.push).toEqual([{ menuId: 10, desired: 'UNAVAILABLE' }])
  })

  it('pushes when the sell window crosses now', () => {
    const open = policy({ sellStartTime: null, sellEndTime: null })
    const closed = policy()
    const work = selectGrabAvailabilityWork({
      previous: [open],
      next: [closed],
      records: {},
      now: AT_1430_BKK,
    })
    expect(work.push).toEqual([{ menuId: 10, desired: 'UNAVAILABLE' }])
  })

  it('does not push when the new window is still open', () => {
    const open = policy({ sellStartTime: null, sellEndTime: null })
    const windowed = policy()
    const work = selectGrabAvailabilityWork({
      previous: [open],
      next: [windowed],
      records: {},
      now: AT_1000_BKK,
    })
    expect(work.push).toEqual([])
    expect(work.remember).toEqual([{ menuId: 10, desired: 'AVAILABLE' }])
  })

  it('pushes sold-out on and off', () => {
    const on = selectGrabAvailabilityWork({
      previous: [policy({ sellStartTime: null, sellEndTime: null, soldOut: false })],
      next: [policy({ sellStartTime: null, sellEndTime: null, soldOut: true })],
      records: {},
      now: AT_1000_BKK,
    })
    expect(on.push).toEqual([{ menuId: 10, desired: 'UNAVAILABLE' }])

    const off = selectGrabAvailabilityWork({
      previous: [policy({ sellStartTime: null, sellEndTime: null, soldOut: true })],
      next: [policy({ sellStartTime: null, sellEndTime: null, soldOut: false })],
      records: { '10': { status: 'UNAVAILABLE', ok: true } },
      now: AT_1000_BKK,
    })
    expect(off.push).toEqual([{ menuId: 10, desired: 'AVAILABLE' }])
  })

  it('retries a failed close on the next save even if the checkbox did not change', () => {
    const closed = policy({ soldOut: true, sellStartTime: null, sellEndTime: null })
    const work = selectGrabAvailabilityWork({
      previous: [closed],
      next: [closed],
      records: { '10': { status: 'UNAVAILABLE', ok: false } },
      now: AT_1000_BKK,
    })
    expect(work.push).toEqual([{ menuId: 10, desired: 'UNAVAILABLE' }])
  })

  it('parses legacy string records', () => {
    expect(parseGrabAvailabilityRecord('UNAVAILABLE')).toEqual({ status: 'UNAVAILABLE', ok: true })
    expect(parseGrabAvailabilityRecord({ status: 'AVAILABLE', ok: false })).toEqual({
      status: 'AVAILABLE',
      ok: false,
    })
  })
})
