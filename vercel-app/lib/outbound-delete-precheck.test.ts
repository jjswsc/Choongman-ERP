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
})
