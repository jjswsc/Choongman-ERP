import {
  applyGuestBillBuffetPrint,
  isQrBuffetIncludedGuestBillLine,
  pickBuffetIncludedFromOrderLine,
  shouldHideBuffetIncludedOnGuestBill,
  stripQrBuffetKitchenTagsFromNote,
} from '@/lib/pos-guest-bill-buffet-print'

describe('guest bill buffet print', () => {
  it('defaults to showing buffet-included lines', () => {
    expect(shouldHideBuffetIncludedOnGuestBill(undefined)).toBe(false)
    expect(shouldHideBuffetIncludedOnGuestBill({})).toBe(false)
    expect(shouldHideBuffetIncludedOnGuestBill({ hideBuffetIncludedOnGuestBill: false })).toBe(false)
    expect(shouldHideBuffetIncludedOnGuestBill({ hideBuffetIncludedOnGuestBill: true })).toBe(true)
  })

  it('keeps the buffet package line and paid extras when hiding is on', () => {
    const rows = applyGuestBillBuffetPrint(
      [
        { id: 'buffet-entry-9', name: '[Buffet] Buffet 299 × 2', price: 299, qty: 2, isBuffetEntry: true },
        { id: 'c1', name: 'Chicken สันในไก่', price: 0, qty: 1, note: 'Buffet', buffetIncluded: true },
        { id: 'e1', name: 'Mama', price: 69, qty: 1, note: 'Extra' },
      ],
      { hideBuffetIncludedOnGuestBill: true }
    )
    expect(rows.map((r) => r.name)).toEqual(['[Buffet] Buffet 299 × 2', 'Mama'])
    expect(rows[1]?.note).toBe('')
  })

  it('does not hide complimentary 0฿ lines without the buffet flag', () => {
    const rows = applyGuestBillBuffetPrint([
      { id: 'free', name: 'Service chicken', price: 0, qty: 1, note: 'on the house' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Service chicken')
  })

  it('keeps Extra items and only strips the kitchen tag', () => {
    expect(stripQrBuffetKitchenTagsFromNote('no onion · Extra')).toBe('no onion')
    expect(stripQrBuffetKitchenTagsFromNote('extra spicy')).toBe('extra spicy')
    expect(isQrBuffetIncludedGuestBillLine({ price: 69, note: 'Extra' })).toBe(false)
  })

  it('falls back to Buffet note + 0฿ when the flag is missing', () => {
    expect(isQrBuffetIncludedGuestBillLine({ price: 0, note: 'Buffet' })).toBe(true)
    expect(pickBuffetIncludedFromOrderLine({ buffet_included: true })).toEqual({ buffetIncluded: true })
  })

  it('leaves lines unchanged when the setting is off', () => {
    const src = [
      { id: 'c1', name: 'Chicken', price: 0, qty: 1, note: 'Buffet', buffetIncluded: true as const },
    ]
    expect(applyGuestBillBuffetPrint(src)).toEqual(src)
    expect(applyGuestBillBuffetPrint(src, { hideBuffetIncludedOnGuestBill: false })).toEqual(src)
  })
})
