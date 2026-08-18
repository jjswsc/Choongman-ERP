import { describe, expect, it } from 'vitest'
import { aggregateQrGuestSentLines, groupQrGuestSentLinesByTime, splitQrGuestMenusByTier } from '@/lib/qr-table-guest-menu'

describe('aggregateQrGuestSentLines', () => {
  it('sums qty for the same name and skips cancelled', () => {
    const rows = aggregateQrGuestSentLines([
      { name: 'Beef', qty: 1, price: 0, buffetIncluded: true },
      { name: 'Beef', quantity: 2, price: 0, buffetIncluded: true },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false, cancelled: true },
    ])
    expect(rows).toEqual([
      { name: 'Beef', qty: 3, price: 0, buffetIncluded: true },
      { name: 'Coke', qty: 1, price: 40, buffetIncluded: false },
    ])
  })
})

describe('groupQrGuestSentLinesByTime', () => {
  it('groups by addedAt and keeps separate rounds', () => {
    const groups = groupQrGuestSentLinesByTime([
      { name: '[Buffet] Buffet 299 × 2', qty: 2, price: 299, addedAt: '2026-08-13 13:30:07', isBuffetEntry: true },
      { name: 'Chicken สันในไก่', qty: 1, price: 0, buffetIncluded: true, addedAt: '2026-08-13 13:36:04' },
      { name: 'Chicken ไก่หมัก', qty: 1, price: 0, buffetIncluded: true, addedAt: '2026-08-13 13:36:04' },
      { name: 'coke', qty: 1, price: 30, buffetIncluded: false, addedAt: '2026-08-13 13:42:53' },
    ])
    expect(groups.map((g) => g.timeLabel)).toEqual(['13:30:07', '13:36:04', '13:42:53'])
    expect(groups[1].lines.map((l) => l.name)).toEqual(['Chicken สันในไก่', 'Chicken ไก่หมัก'])
    expect(groups[2].lines).toEqual([{ name: 'coke', qty: 1, price: 30, buffetIncluded: false }])
  })

  it('clusters nearby QR id timestamps from the same send', () => {
    const t0 = Date.parse('2026-08-13T13:36:04+07:00')
    const groups = groupQrGuestSentLinesByTime([
      { id: `qr-9-10-${t0}-abc12`, name: 'Chicken สันในไก่', qty: 1, price: 0, buffetIncluded: true },
      { id: `qr-9-11-${t0 + 80}-def34`, name: 'Chicken ไก่หมัก', qty: 1, price: 0, buffetIncluded: true },
      { id: `qr-9-20-${t0 + 6 * 60 * 1000 + 49000}-ghi56`, name: 'coke', qty: 1, price: 30, buffetIncluded: false },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].timeLabel).toBe('13:36:04')
    expect(groups[0].lines.map((l) => l.name)).toEqual(['Chicken สันในไก่', 'Chicken ไก่หมัก'])
    expect(groups[1].timeLabel).toBe('13:42:53')
  })

  it('uses session createdAt for buffet-entry without addedAt', () => {
    const groups = groupQrGuestSentLinesByTime(
      [{ id: 'buffet-entry-9', name: '[Buffet] Buffet 299 × 2', qty: 2, price: 299, isBuffetEntry: true }],
      '2026-08-13 13:30:07'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].timeLabel).toBe('13:30:07')
  })

  it('treats timestamptz Z fallback as Bangkok wall clock (not UTC+7)', () => {
    const groups = groupQrGuestSentLinesByTime(
      [{ id: 'buffet-entry-9', name: '[Buffet] Buffet 299 × 2', qty: 2, price: 299, isBuffetEntry: true }],
      '2026-08-18T09:31:04.000Z'
    )
    expect(groups[0].timeLabel).toBe('09:31:04')
  })

  it('keeps buffet as round 1 when session createdAt comes back as Z', () => {
    const groups = groupQrGuestSentLinesByTime(
      [
        { name: 'Chicken สันในไก่', qty: 4, price: 0, buffetIncluded: true, addedAt: '2026-08-18 09:34:19' },
        { name: 'Chicken ไก่หมัก', qty: 2, price: 0, buffetIncluded: true, addedAt: '2026-08-18 09:38:50' },
        { name: 'Coke Zero', qty: 2, price: 40, buffetIncluded: false, addedAt: '2026-08-18 09:40:18' },
        {
          id: 'buffet-entry-1',
          name: '[Buffet] Buffet 299 x 2',
          qty: 2,
          price: 299,
          isBuffetEntry: true,
        },
      ],
      '2026-08-18T09:31:04.000Z'
    )
    expect(groups.map((g) => g.timeLabel)).toEqual(['09:31:04', '09:34:19', '09:38:50', '09:40:18'])
    expect(groups[0].lines[0].name).toBe('[Buffet] Buffet 299 x 2')
  })
})

describe('splitQrGuestMenusByTier', () => {
  const menus = [{ menuId: 1 }, { menuId: 2 }, { menuId: 3 }]

  it('puts non-included menus on extras when extra allowlist is empty', () => {
    const r = splitQrGuestMenusByTier({ menus, includedIds: [1], extraIds: [] })
    expect(r.included.map((m) => m.menuId)).toEqual([1])
    expect(r.extras.map((m) => m.menuId)).toEqual([2, 3])
  })

  it('limits extras to the allowlist for 299/399/499 packages', () => {
    const r = splitQrGuestMenusByTier({ menus, includedIds: [1], extraIds: [3] })
    expect(r.included.map((m) => m.menuId)).toEqual([1])
    expect(r.extras.map((m) => m.menuId)).toEqual([3])
  })
})
