import { describe, expect, it } from 'vitest'
import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'
import {
  inferPrevQtySnapshotExcludingRecentQrGuestLines,
  shouldSkipHallAutoprintForQrGuestAddon,
} from '@/lib/qr-table-types'

describe('isQrBuffetPackageKitchenSkipLine', () => {
  it('skips synthetic buffet-entry id', () => {
    expect(isQrBuffetPackageKitchenSkipLine({ id: 'buffet-entry-12', name: '[Buffet] Buffet 499 × 2' })).toBe(
      true
    )
  })

  it('skips isBuffetEntry even with another id', () => {
    expect(isQrBuffetPackageKitchenSkipLine({ id: 'line-1', isBuffetEntry: true })).toBe(true)
  })

  it('does not skip real buffet-included kitchen items', () => {
    expect(
      isQrBuffetPackageKitchenSkipLine({
        id: 'menu-uuid-1',
        name: '[Buffet] Fried Chicken',
        source: 'qr_table',
        buffetIncluded: true,
      })
    ).toBe(false)
  })
})

describe('shouldSkipHallAutoprintForQrGuestAddon', () => {
  it('skips hall check-bill when all new lines are from the guest phone', () => {
    expect(
      shouldSkipHallAutoprintForQrGuestAddon([
        { id: 'qr-12-99-1', source: 'qr_table', name: 'Chicken' },
        { id: 'qr-12-88-1', source: 'qr_table', name: 'Marinated' },
      ])
    ).toBe(true)
  })

  it('does not skip when staff POS add-on is in the delta', () => {
    expect(
      shouldSkipHallAutoprintForQrGuestAddon([
        { id: 'cart-1', name: 'Chicken' },
        { id: 'qr-12-99-1', source: 'qr_table' },
      ])
    ).toBe(false)
  })

  it('does not skip empty delta', () => {
    expect(shouldSkipHallAutoprintForQrGuestAddon([])).toBe(false)
  })
})

describe('inferPrevQtySnapshotExcludingRecentQrGuestLines', () => {
  it('treats recent QR guest lines as the addon delta when snapshot is missing', () => {
    const nowMs = 1_776_000_000_000
    const staffKey = 'staff-1'
    const qrKey = `qr-12-99-${nowMs - 3_000}-abc`
    const items = [
      { id: staffKey, name: 'Buffet', qty: 2 },
      { id: qrKey, name: 'Chicken', qty: 1, source: 'qr_table' as const },
    ]
    const newQtyById = new Map([
      [staffKey, 2],
      [qrKey, 1],
    ])
    const prev = inferPrevQtySnapshotExcludingRecentQrGuestLines({
      items,
      newQtyById,
      resolveKey: (it) => String(it.id || ''),
      nowMs,
    })
    expect(prev).not.toBeNull()
    expect(prev?.get(staffKey)).toBe(2)
    expect(prev?.has(qrKey)).toBe(false)
  })

  it('still infers when POS clock is a few seconds behind addedAt', () => {
    const nowMs = 1_776_000_000_000
    const qrKey = `qr-12-99-${nowMs + 2_000}-abc`
    const items = [{ id: qrKey, name: 'Chicken', qty: 1, source: 'qr_table' as const }]
    const newQtyById = new Map([[qrKey, 1]])
    const prev = inferPrevQtySnapshotExcludingRecentQrGuestLines({
      items,
      newQtyById,
      resolveKey: (it) => String(it.id || ''),
      nowMs,
    })
    expect(prev).not.toBeNull()
    expect(prev?.has(qrKey)).toBe(false)
  })

  it('infers from addedAt when QR id is not only digits', () => {
    const nowMs = 1_776_000_000_000
    const qrKey = `qr-12-menuA-${nowMs - 1_000}-x9k`
    const items = [
      {
        id: qrKey,
        name: 'Chicken',
        qty: 1,
        source: 'qr_table' as const,
        addedAt: '2026-02-10 12:00:00',
      },
    ]
    const newQtyById = new Map([[qrKey, 1]])
    const prev = inferPrevQtySnapshotExcludingRecentQrGuestLines({
      items,
      newQtyById,
      resolveKey: (it) => String(it.id || ''),
      nowMs: Date.parse('2026-02-10T12:00:01+07:00'),
    })
    expect(prev).not.toBeNull()
    expect(prev?.has(qrKey)).toBe(false)
  })

  it('returns null when there is no recent QR guest line', () => {
    const items = [{ id: 'staff-1', name: 'Chicken', qty: 1 }]
    const newQtyById = new Map([['staff-1', 1]])
    expect(
      inferPrevQtySnapshotExcludingRecentQrGuestLines({
        items,
        newQtyById,
        resolveKey: (it) => String(it.id || ''),
      })
    ).toBeNull()
  })
})
