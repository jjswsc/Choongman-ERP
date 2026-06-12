import { describe, expect, it } from 'vitest'
import { formatGrabDeliveryTableDisplayName } from '@/lib/pos-grab-manual-delivery-guard'

describe('formatGrabDeliveryTableDisplayName', () => {
  it('appends Grab orderID suffix for webhook orders', () => {
    expect(
      formatGrabDeliveryTableDisplayName(
        'Grab #GF-216 · Delivery · Mariaa Rya',
        'grab_order:00160834053-C8AVG2AFGFNKWE|grab_state:DELIVERED'
      )
    ).toContain('ID AFGFNKWE')
  })

  it('leaves manual grab label unchanged', () => {
    expect(formatGrabDeliveryTableDisplayName('Grab #GF-216', '')).toBe('Grab #GF-216')
  })
})
