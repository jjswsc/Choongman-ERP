import { describe, expect, it } from 'vitest'
import { createServerTiming } from '@/lib/server-timing'

function clock(times: number[]) {
  let i = 0
  return () => times[Math.min(i++, times.length - 1)]
}

describe('createServerTiming', () => {
  it('단계별 경과 시간과 total', () => {
    const timing = createServerTiming(clock([0, 120, 450, 500]))
    timing.mark('auth')
    timing.mark('update')
    expect(timing.header()).toBe('auth;dur=120, update;dur=330, total;dur=500')
  })

  it('같은 단계 이름은 누적, 헤더 토큰에 못 쓰는 문자는 _', () => {
    const timing = createServerTiming(clock([0, 10, 30, 60, 60]))
    timing.mark('db')
    timing.mark('stock deduct')
    timing.mark('db')
    expect(timing.header()).toBe('db;dur=40, stock_deduct;dur=20, total;dur=60')
  })

  it('apply 는 Server-Timing 헤더를 넣는다', () => {
    const timing = createServerTiming(clock([0, 5]))
    const headers = new Headers()
    timing.apply(headers)
    expect(headers.get('Server-Timing')).toBe('total;dur=5')
  })
})
