import { describe, expect, it } from 'vitest'
import { isOutboundLogDateInBangkokYmdRange } from '@/lib/hq-outbound-income-total'

describe('isOutboundLogDateInBangkokYmdRange', () => {
  it('4월 조회에 3월 방콕 출고일은 제외', () => {
    expect(
      isOutboundLogDateInBangkokYmdRange('2026-03-31T10:00:00+07:00', '2026-04-01', '2026-04-30')
    ).toBe(false)
  })

  it('4월 방콕 출고일은 포함', () => {
    expect(
      isOutboundLogDateInBangkokYmdRange('2026-04-15T12:00:00+07:00', '2026-04-01', '2026-04-30')
    ).toBe(true)
  })

  it('UTC 자정 직전(방콕 3/31)은 4월에 포함하지 않음', () => {
    expect(
      isOutboundLogDateInBangkokYmdRange('2026-03-31T16:59:59.000Z', '2026-04-01', '2026-04-30')
    ).toBe(false)
  })

  it('방콕 4/1 00:30은 4월에 포함', () => {
    expect(
      isOutboundLogDateInBangkokYmdRange('2026-03-31T17:30:00.000Z', '2026-04-01', '2026-04-30')
    ).toBe(true)
  })
})
