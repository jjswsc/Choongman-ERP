// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearPosAutoPrintDedupeForTests } from '@/lib/pos-auto-print-dedupe'
import {
  lookupPosLocalOrderServerId,
  markPosQueuedOrderLocallyPrinted,
  rememberPosLocalOrderServerId,
  wasPosQueuedOrderLocallyPrinted,
  wasPosQueuedOrderLocallyPrintedByHash,
} from '@/lib/offline/pos-local-order-records'

describe('pos-local-order-records', () => {
  beforeEach(() => {
    clearPosAutoPrintDedupeForTests()
    window.localStorage.clear()
  })

  it('로컬 인쇄 기록은 localStorage에 남아 새로고침 후에도 확인된다', () => {
    expect(wasPosQueuedOrderLocallyPrinted('pos-1')).toBe(false)
    markPosQueuedOrderLocallyPrinted('pos-1')
    expect(wasPosQueuedOrderLocallyPrinted('pos-1')).toBe(true)
    expect(window.localStorage.getItem('cm_pos_autoprint_dedupe_v1')).toContain('local:pos-1:printed')
  })

  it('해시 형식이 아니면 false', () => {
    expect(wasPosQueuedOrderLocallyPrintedByHash('not-a-hash')).toBe(false)
    expect(wasPosQueuedOrderLocallyPrintedByHash(null)).toBe(false)
  })

  it('localOrderNo → 서버 id 매핑', () => {
    expect(lookupPosLocalOrderServerId('pos-2')).toBeNull()
    rememberPosLocalOrderServerId('pos-2', 9876)
    expect(lookupPosLocalOrderServerId('pos-2')).toBe(9876)
    rememberPosLocalOrderServerId('pos-3', 0)
    expect(lookupPosLocalOrderServerId('pos-3')).toBeNull()
  })
})
