import { describe, expect, it } from 'vitest'
import {
  isOutboundBillableForInvoice,
  normalizeOutboundDeliveryStatus,
  partitionOutboundInvoiceGroups,
} from '@/lib/outbound-billable-delivery'

describe('normalizeOutboundDeliveryStatus', () => {
  it('maps delivered / received / partial / transit', () => {
    expect(normalizeOutboundDeliveryStatus('배송완료')).toBe('배송완료')
    expect(normalizeOutboundDeliveryStatus('배송 완료')).toBe('배송완료')
    expect(normalizeOutboundDeliveryStatus('일부 배송 완료')).toBe('일부배송완료')
    expect(normalizeOutboundDeliveryStatus('배송 중')).toBe('배송중')
    expect(normalizeOutboundDeliveryStatus('Delivered')).toBe('배송완료')
    expect(normalizeOutboundDeliveryStatus('수령완료')).toBe('배송완료')
    expect(normalizeOutboundDeliveryStatus('일부배송완료')).toBe('일부배송완료')
    expect(normalizeOutboundDeliveryStatus('Partial')).toBe('일부배송완료')
    expect(normalizeOutboundDeliveryStatus('배송중')).toBe('배송중')
    expect(normalizeOutboundDeliveryStatus('Transit')).toBe('배송중')
    expect(normalizeOutboundDeliveryStatus('จัดส่งแล้ว')).toBe('배송완료')
    expect(normalizeOutboundDeliveryStatus('กำลังจัดส่ง')).toBe('배송중')
    expect(normalizeOutboundDeliveryStatus('2026-09-17')).toBe('')
    expect(normalizeOutboundDeliveryStatus('')).toBe('')
  })
})

describe('isOutboundBillableForInvoice', () => {
  it('allows order rows only after delivery (including partial)', () => {
    expect(isOutboundBillableForInvoice({ type: 'Order', deliveryStatus: '배송완료' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Outbound', deliveryStatus: '배송완료' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Outbound', deliveryStatus: '일부배송완료' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Outbound', deliveryStatus: '배송중' })).toBe(false)
    expect(isOutboundBillableForInvoice({ type: 'Order', deliveryStatus: '일부배송완료' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Order', deliveryStatus: '배송중' })).toBe(false)
    expect(isOutboundBillableForInvoice({ type: 'Order', deliveryStatus: '' })).toBe(false)
  })

  it('allows force outbound unless still in transit', () => {
    expect(isOutboundBillableForInvoice({ type: 'Force', deliveryStatus: '2026-09-17' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Force', deliveryStatus: '수령완료' })).toBe(true)
    expect(isOutboundBillableForInvoice({ type: 'Force', deliveryStatus: '배송중' })).toBe(false)
    expect(isOutboundBillableForInvoice({ type: 'ForceOutbound', deliveryStatus: '' })).toBe(true)
  })
})

describe('partitionOutboundInvoiceGroups', () => {
  it('splits in-transit orders from delivered / force groups', () => {
    const groups = [
      { type: 'Order', items: [{ deliveryStatus: '배송중' }] },
      { type: 'Order', items: [{ deliveryStatus: '배송완료' }] },
      { type: 'Force', items: [{ deliveryStatus: '2026-09-16' }] },
    ]
    const { billable, skipped } = partitionOutboundInvoiceGroups(groups)
    expect(billable).toHaveLength(2)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].type).toBe('Order')
  })
})
