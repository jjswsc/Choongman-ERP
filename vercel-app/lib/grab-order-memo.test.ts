import { describe, expect, it } from 'vitest'
import {
  buildGrabOrderMemo,
  extractGrabOrderIdFromMemo,
  mergeGrabStateIntoFullMemo,
  preserveGrabDeliveryMemoAnchor,
} from '@/lib/grab-order-memo'
import { TAX_INVOICE_MARKER } from '@/lib/pos-tax-invoice'

describe('preserveGrabDeliveryMemoAnchor', () => {
  const grabId = '001889724231-C8ACVGM1V35HC6'
  const existing = buildGrabOrderMemo(grabId, 'DRIVER_ARRIVED')

  it('keeps grab anchor when incoming memo is empty', () => {
    expect(preserveGrabDeliveryMemoAnchor('', existing)).toBe(existing)
  })

  it('does not change incoming memo that already has grab_order', () => {
    const incoming = buildGrabOrderMemo(grabId, 'DELIVERED')
    expect(preserveGrabDeliveryMemoAnchor(incoming, existing)).toBe(incoming)
  })

  it('prepends grab anchor to plain incoming memo', () => {
    expect(preserveGrabDeliveryMemoAnchor('customer note', existing)).toBe(
      `${existing}\ncustomer note`
    )
  })

  it('preserves tax invoice tail when incoming omits grab anchor', () => {
    const taxTail = `${TAX_INVOICE_MARKER}name=Test|taxId=123`
    const incoming = taxTail
    expect(preserveGrabDeliveryMemoAnchor(incoming, existing)).toBe(`${existing} ${taxTail}`)
  })

  it('returns incoming unchanged when existing has no grab anchor', () => {
    expect(preserveGrabDeliveryMemoAnchor('plain only', 'plain only')).toBe('plain only')
  })

  it('mergeGrabStateIntoFullMemo restores anchor on empty memo', () => {
    const merged = mergeGrabStateIntoFullMemo('', grabId, 'DELIVERED')
    expect(extractGrabOrderIdFromMemo(merged)).toBe(grabId)
    expect(merged).toContain('grab_state:DELIVERED')
  })
})
