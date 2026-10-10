import { describe, expect, it } from 'vitest'
import {
  buildGrabOrderMemo,
  extractGrabOrderIdFromMemo,
  extractGrabStateFromMemo,
  isGrabAutoPaidMemo,
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

describe('grab auto-paid memo token', () => {
  const grabId = '001889724231-C8ACVGM1V35HC6'

  it('marks auto-paid without breaking id/state parsing', () => {
    const memo = mergeGrabStateIntoFullMemo(buildGrabOrderMemo(grabId, 'COLLECTED'), grabId, 'COLLECTED', {
      autoPaid: true,
    })
    expect(isGrabAutoPaidMemo(memo)).toBe(true)
    expect(extractGrabOrderIdFromMemo(memo)).toBe(grabId)
    expect(extractGrabStateFromMemo(memo)).toBe('COLLECTED')
  })

  it('keeps the token through later state merges and anchor restores', () => {
    const autoPaid = buildGrabOrderMemo(grabId, 'COLLECTED', { autoPaid: true })
    const delivered = mergeGrabStateIntoFullMemo(autoPaid, grabId, 'DELIVERED')
    expect(isGrabAutoPaidMemo(delivered)).toBe(true)
    expect(extractGrabStateFromMemo(delivered)).toBe('DELIVERED')
    expect(isGrabAutoPaidMemo(preserveGrabDeliveryMemoAnchor('note', autoPaid))).toBe(true)
  })

  it('is absent on normal grab memos', () => {
    expect(isGrabAutoPaidMemo(buildGrabOrderMemo(grabId, 'DELIVERED'))).toBe(false)
  })
})
