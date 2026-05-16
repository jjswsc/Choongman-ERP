import { describe, expect, it } from 'vitest'
import { formatBahtWhole, formatPosQtyCompact } from './utils'

describe('formatBahtWhole', () => {
  it('반올림 정수·천 단위 구분', () => {
    expect(formatBahtWhole(219.49)).toBe('219')
    expect(formatBahtWhole(1234.5)).toBe('1,235')
  })
})

describe('formatPosQtyCompact', () => {
  it('정수 수량은 소수 생략', () => {
    expect(formatPosQtyCompact(1)).toBe('1')
    expect(formatPosQtyCompact(1.0)).toBe('1')
  })
})
