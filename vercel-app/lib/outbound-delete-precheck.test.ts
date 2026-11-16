import { describe, expect, it } from 'vitest'
import { projectOutstandingAfterDelete } from '@/lib/outbound-delete-precheck'

describe('projectOutstandingAfterDelete', () => {
  it('삭제 후 잔액을 매장별로 계산한다', () => {
    const result = projectOutstandingAfterDelete({
      currentOutstandingByStore: { A: 1000, B: 500 },
      deletingReceivableByStore: { A: 300, B: 100 },
    })
    expect(result.projectedByStore.A).toBe(700)
    expect(result.projectedByStore.B).toBe(400)
    expect(result.overReceivedStores).toHaveLength(0)
  })

  it('삭제 후 음수면 수금 초과 충돌로 반환한다', () => {
    const result = projectOutstandingAfterDelete({
      currentOutstandingByStore: { A: 120 },
      deletingReceivableByStore: { A: 500 },
    })
    expect(result.projectedByStore.A).toBe(-380)
    expect(result.overReceivedStores).toEqual([{ store: 'A', projected: -380 }])
  })

  it('이미 수금 초과여도 삭제 미수가 0이면 충돌하지 않는다', () => {
    const result = projectOutstandingAfterDelete({
      currentOutstandingByStore: { 'CM Seacon Srinakarin': -188793.62 },
      deletingReceivableByStore: { 'CM Seacon Srinakarin': 0 },
    })
    expect(result.projectedByStore['CM Seacon Srinakarin']).toBe(-188793.62)
    expect(result.overReceivedStores).toHaveLength(0)
  })

  it('이미 수금 초과인 매장에서 미수를 더 지우면 충돌한다', () => {
    const result = projectOutstandingAfterDelete({
      currentOutstandingByStore: { A: -100 },
      deletingReceivableByStore: { A: 50 },
    })
    expect(result.projectedByStore.A).toBe(-150)
    expect(result.overReceivedStores).toEqual([{ store: 'A', projected: -150 }])
  })
})
