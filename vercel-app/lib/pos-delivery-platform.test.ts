import { describe, expect, it } from 'vitest'
import { isApiInboundDeliveryOrderMemo, pickPosChannelOrderNo } from '@/lib/pos-delivery-platform'

describe('isApiInboundDeliveryOrderMemo', () => {
  it('is true for Grab/ShopeeFood/LineMan webhook memo anchors', () => {
    expect(isApiInboundDeliveryOrderMemo('grab_order:ABC-12|grab_state:PENDING')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('sf_order:12345')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('lineman_order:lm-99')).toBe(true)
    expect(isApiInboundDeliveryOrderMemo('prefix shopee_order:xyz tail')).toBe(true)
  })
  it('is false for manual POS memos', () => {
    expect(isApiInboundDeliveryOrderMemo('')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('  ')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('ไม่เผ็ด ห้ามถั่ว')).toBe(false)
    expect(isApiInboundDeliveryOrderMemo('Grab #123 ลูกค้ารอหน้าร้าน')).toBe(false)
  })
})

describe('pickPosChannelOrderNo (sf_order anchor)', () => {
  it('reads ShopeeFood dedupe memo when no # in table_name', () => {
    const pick = pickPosChannelOrderNo({
      tableName: 'ShopeeFood',
      orderNo: 'POS-001',
      memo: 'sf_order:778899',
    })
    expect(pick.kind).toBe('memo_anchor')
    expect(pick.text).toBe('778899')
  })
})
