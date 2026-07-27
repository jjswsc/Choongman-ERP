import { describe, expect, it } from 'vitest'
import {
  appendPosOrderMergedAbsorbStamp,
  appendPosOrderMergedKeepStamp,
  buildPosOrderMergedAbsorbStamp,
  buildPosOrderMergedKeepStamp,
  isPosMergeAbsorbedLineId,
  isPosOrderMergedAbsorb,
  isPosOrderMergedAbsorbRow,
  isPosOrderMergedKeepReceive,
  isPosOrderStatsCancellation,
  isRecentPosOrderMergeKeepReceive,
  parseLatestPosOrderMergeKeepStamp,
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

  it('builds keep receive stamp and detects recent window', () => {
    const stamp = buildPosOrderMergedKeepStamp({ absorbOrderId: 57 })
    expect(stamp).toMatch(/^\[ORDER_MERGE_KEEP .+ absorb_id=57\]$/)
    const memo = appendPosOrderMergedKeepStamp('table memo', { absorbOrderId: 57 })
    expect(isPosOrderMergedKeepReceive(memo)).toBe(true)
    expect(isRecentPosOrderMergeKeepReceive(memo, 60_000)).toBe(true)
    const parsed = parseLatestPosOrderMergeKeepStamp(memo)
    expect(parsed?.absorbOrderId).toBe(57)
    expect(isPosMergeAbsorbedLineId('m57-line-1')).toBe(true)
    expect(isPosMergeAbsorbedLineId('line-1')).toBe(false)
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
