import { describe, expect, it } from 'vitest'
import { mergeSetChildrenForReceipt } from '@/lib/pos-hall-order-receipt-document-html'

type MergeSetTestItem = {
  id: string
  name: string
  price?: number
  qty: number
  promoId?: string
  promoCode?: string
}

describe('mergeSetChildrenForReceipt', () => {
  it('merges children by shared promoCode when bracket child markers are missing', () => {
    const rows = mergeSetChildrenForReceipt([
      { id: 'p1', name: '[April] Set 3', qty: 1, promoId: '3', promoCode: '260457-S03' },
      { id: 'c1', name: 'PEPSI MEGA 1', qty: 1, promoCode: '260457-S03' },
      { id: 'c2', name: 'PEPSI MEGA 2', qty: 1, promoCode: '260457-S03' },
    ] satisfies MergeSetTestItem[])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toContain('Set 3')
    expect(rows[0]?.promoItems?.map((x) => x.menuName)).toEqual([
      'PEPSI MEGA 1',
      'PEPSI MEGA 2',
    ])
  })
})
