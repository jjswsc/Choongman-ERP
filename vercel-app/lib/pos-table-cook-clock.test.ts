import { describe, expect, it } from 'vitest'
import { posTableCookClockIso } from '@/lib/pos-table-cook-clock'

describe('posTableCookClockIso', () => {
  it('does not start the clock for a QR session that only has a buffet entry', () => {
    expect(
      posTableCookClockIso({
        createdAt: '2026-09-25T07:03:00.000Z',
        items: [{ id: 'buffet-entry-9', isBuffetEntry: true }],
      })
    ).toBeUndefined()
  })

  it('does not start the clock when the order has no items', () => {
    expect(posTableCookClockIso({ createdAt: '2026-09-25T07:03:00.000Z', items: [] })).toBeUndefined()
  })

  it('starts from the first food line, not the QR open time', () => {
    const iso = posTableCookClockIso({
      createdAt: '2026-09-25T07:03:00.000Z',
      items: [
        { id: 'buffet-entry-1', isBuffetEntry: true, addedAt: '2026-09-25 14:03:00' },
        { id: 'katsu', addedAt: '2026-09-25 17:33:57' },
        { id: 'ice', addedAt: '2026-09-25 17:36:05' },
      ],
    })
    expect(iso).toBe('2026-09-25T10:33:57.000Z')
  })

  it('uses the order time for a staff ticket that has food but no addedAt', () => {
    const iso = posTableCookClockIso({
      createdAt: new Date('2026-09-25T10:33:57.000Z'),
      items: [{ id: 'katsu' }],
    })
    expect(iso).toBe('2026-09-25T10:33:57.000Z')
  })
})
