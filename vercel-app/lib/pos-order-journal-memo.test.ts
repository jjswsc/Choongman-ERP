import { describe, expect, it } from 'vitest'
import {
  buildPosOrderCompletedJournalMemo,
  localizePosOrderJournalMemo,
  POS_ORDER_COMPLETED_MEMO_PREFIX,
} from './pos-order-journal-memo'

describe('pos-order-journal-memo', () => {
  it('builds distinguishable memo with store, order, pay, channel', () => {
    expect(
      buildPosOrderCompletedJournalMemo({
        storeName: 'CM Silom',
        orderNo: 'A-1001',
        orderType: 'delivery',
        deliveryAppCode: 'grab',
        paymentDeliveryApp: 398,
      })
    ).toBe(`${POS_ORDER_COMPLETED_MEMO_PREFIX} | CM Silom | #A-1001 | 배달앱 | Grab | 배달`)
  })

  it('localizes detail tokens for Thai', () => {
    const raw = `${POS_ORDER_COMPLETED_MEMO_PREFIX} | CM Silom | #A-1001 | 현금+QR | 매장`
    expect(localizePosOrderJournalMemo(raw, 'th')).toBe(
      'ขายจากออเดอร์ POS · CM Silom · #A-1001 · เงินสด+QR · ทานที่ร้าน'
    )
  })

  it('keeps plain prefix localization', () => {
    expect(localizePosOrderJournalMemo(POS_ORDER_COMPLETED_MEMO_PREFIX, 'th')).toBe('ขายจากออเดอร์ POS')
  })
})
