import { describe, expect, it } from 'vitest'
import {
  appendPosOrderMergedAbsorbStamp,
  buildPosOrderMergedAbsorbStamp,
  isPosOrderMergedAbsorb,
  isPosOrderMergedAbsorbRow,
  isPosOrderStatsCancellation,
  parsePosOrderMergedKeepRef,
} from '@/lib/pos-order-merge'

describe('pos-order-merge', () => {
  it('builds and parses merged absorb stamp', () => {
    const stamp = buildPosOrderMergedAbsorbStamp({
      keepOrderId: 27,
      keepOrderNo: 'CMHUAMAK-20260602-027',
    })
    expect(stamp).toMatch(/^\[ORDER_MERGED .+ keep_id=27 keep_no=CMHUAMAK-20260602-027\]$/)
    const memo = appendPosOrderMergedAbsorbStamp('takeout memo', {
      keepOrderId: 27,
      keepOrderNo: 'CMHUAMAK-20260602-027',
    })
    expect(isPosOrderMergedAbsorb(memo)).toBe(true)
    expect(parsePosOrderMergedKeepRef(memo)).toEqual({
      keepOrderId: 27,
      keepOrderNo: 'CMHUAMAK-20260602-027',
    })
  })

  it('excludes merged absorb from stats cancellation', () => {
    const memo = appendPosOrderMergedAbsorbStamp('', { keepOrderId: 1, keepOrderNo: 'A-1' })
    expect(
      isPosOrderStatsCancellation({
        status: 'cancelled',
        memo,
      })
    ).toBe(false)
    expect(isPosOrderMergedAbsorbRow({ status: 'cancelled', memo })).toBe(true)
    expect(isPosOrderStatsCancellation({ status: 'cancelled', memo: '[ORDER_CANCELLED x] oops' })).toBe(
      true
    )
  })
})
