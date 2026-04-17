import { describe, expect, it } from 'vitest'
import {
  collectRealtimeLinearHourIndices,
  realtimeSlotPartsForLinearHour,
  workEndMinutesExtended,
} from '@/lib/realtime-work-grid'

describe('realtime-work-grid', () => {
  it('자정 넘김(17:30~02:30)이 선형 시간 열에 포함된다', () => {
    const hours = collectRealtimeLinearHourIndices([
      {
        pIn: '17:30',
        pOut: '02:30',
        pBS: '',
        pBE: '',
        plan_in_prev_day: false,
      },
    ])
    expect(hours[0]).toBe(17)
    expect(hours[hours.length - 1]).toBe(26)
    expect(hours).toContain(25)
  })

  it('workEndMinutesExtended는 급여와 동일하게 익일 퇴근(+24h)을 반영한다', () => {
    const inMin = 17 * 60 + 30
    const rawOut = 2 * 60 + 30
    expect(workEndMinutesExtended(inMin, rawOut, false)).toBe(rawOut + 24 * 60)
  })

  it('야간 근무 k=23 칸에 근무 반쪽이 생긴다', () => {
    const p = {
      pIn: '17:30',
      pOut: '02:30',
      pBS: '',
      pBE: '',
      plan_in_prev_day: false,
    }
    const s = realtimeSlotPartsForLinearHour(23, p)
    expect(s.inAny).toBe(true)
  })
})
