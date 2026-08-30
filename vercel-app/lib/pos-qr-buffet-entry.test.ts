import { describe, expect, it } from 'vitest'
import { isQrBuffetPackageKitchenSkipLine } from '@/lib/pos-qr-buffet-entry'
import {
  inferPrevQtySnapshotExcludingRecentQrGuestLines,
  markNewlyPrepaidQrExtraLines,
  orderLooksLikeQrTableGuestOrder,
  planQrGuestAddonAutoprint,
  resolveDineInAddonKitchenDelayMs,
  shouldSkipDineInKitchenAddonBecausePayment,
  shouldSkipHallAutoprintForQrGuestAddon,
  shouldSkipQrTableSessionOpenAutoprint,
  shouldSkipRealtimeKitchenAutoprintForQrGuestAddon,
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

describe('shouldSkipDineInKitchenAddonBecausePayment', () => {
  it('blocks kitchen addon when payment is already on a staff POS order', () => {
    expect(shouldSkipDineInKitchenAddonBecausePayment(299, 'pos-cashier')).toBe(true)
    expect(shouldSkipDineInKitchenAddonBecausePayment(299, '')).toBe(true)
  })

  it('allows kitchen addon after QR buffet entry is prepaid', () => {
    expect(shouldSkipDineInKitchenAddonBecausePayment(598, 'qr_table:12')).toBe(false)
    expect(shouldSkipDineInKitchenAddonBecausePayment(0, 'pos-cashier')).toBe(false)
  })
})

describe('orderLooksLikeQrTableGuestOrder', () => {
  it('detects QR table orders from createdBy or guest lines', () => {
    expect(orderLooksLikeQrTableGuestOrder('qr_table:9', [])).toBe(true)
    expect(orderLooksLikeQrTableGuestOrder(null, [{ id: 'qr-9-1-1', source: 'qr_table' }])).toBe(true)
    expect(orderLooksLikeQrTableGuestOrder('pos', [{ id: 'cart-1' }])).toBe(false)
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

describe('shouldSkipQrTableSessionOpenAutoprint', () => {
  it('skips INSERT print when created_by is qr_table', () => {
    expect(shouldSkipQrTableSessionOpenAutoprint({ createdBy: 'qr_table:9', items: [{ id: 'buffet-entry-9' }] })).toBe(
      true
    )
  })

  it('skips INSERT print when memo is QR table and lines are guest/buffet', () => {
    expect(
      shouldSkipQrTableSessionOpenAutoprint({
        createdBy: null,
        memo: '[QR테이블] Buffet / 2pax',
        items: [{ id: 'buffet-entry-3', source: 'qr_table' }],
      })
    ).toBe(true)
  })

  it('does not skip a normal dine-in insert', () => {
    expect(
      shouldSkipQrTableSessionOpenAutoprint({
        createdBy: 'pos',
        memo: '',
        items: [{ id: 'cart-1', name: 'Chicken' }],
      })
    ).toBe(false)
  })
})

describe('planQrGuestAddonAutoprint', () => {
  it('prints hall/kitchen only for staff lines when mixed with QR', () => {
    const plan = planQrGuestAddonAutoprint({
      hallAddonLines: [
        { id: 'cart-1', name: 'Coke' },
        { id: 'qr-12-99-1', source: 'qr_table', name: 'Chicken' },
      ],
      kitchenCartLines: [
        { id: 'cart-1', name: 'Coke' },
        { id: 'qr-12-99-1', source: 'qr_table', name: 'Chicken' },
      ],
    })
    expect(plan.printHall).toBe(true)
    expect(plan.skipRealtimeKitchen).toBe(false)
    expect(plan.hallStaffLines.map((l) => l.id)).toEqual(['cart-1'])
    expect(plan.kitchenStaffLines.map((l) => l.id)).toEqual(['cart-1'])
  })

  it('prints hall from kitchen staff lines when hall addon flags are empty', () => {
    const plan = planQrGuestAddonAutoprint({
      hallAddonLines: [] as Array<{ id: string }>,
      kitchenCartLines: [{ id: 'cart-1', name: 'Coke' }],
    })
    expect(plan.printHall).toBe(true)
    expect(plan.skipRealtimeKitchen).toBe(false)
    expect(plan.hallStaffLines).toEqual([])
    expect(plan.kitchenStaffLines.map((l) => l.id)).toEqual(['cart-1'])
  })

  it('skips both when the delta is QR-only', () => {
    const plan = planQrGuestAddonAutoprint({
      hallAddonLines: [{ id: 'qr-12-99-1', source: 'qr_table' }],
      kitchenCartLines: [{ id: 'qr-12-99-1', source: 'qr_table' }],
    })
    expect(plan.printHall).toBe(false)
    expect(plan.skipRealtimeKitchen).toBe(true)
  })
})

describe('markNewlyPrepaidQrExtraLines', () => {
  it('marks only unpaid extras and leaves already prepaid lines out of the print set', () => {
    const items = [
      { id: 'qr-old', source: 'qr_table', qrPrepaid: true, name: 'Coke' },
      { id: 'qr-new', source: 'qr_table', qrPrepaid: false, name: 'Beer' },
      { id: 'buffet-entry-1', source: 'qr_table', isBuffetEntry: true, name: 'Buffet' },
      { id: 'cart-1', name: 'Staff drink' },
    ]
    const newly = markNewlyPrepaidQrExtraLines(items)
    expect(newly.map((l) => l.id)).toEqual(['qr-new'])
    expect(items[1]?.qrPrepaid).toBe(true)
    expect(items[0]?.qrPrepaid).toBe(true)
  })
})

describe('shouldSkipRealtimeKitchenAutoprintForQrGuestAddon', () => {
  it('skips realtime kitchen when every new line is from a guest phone', () => {
    expect(
      shouldSkipRealtimeKitchenAutoprintForQrGuestAddon([
        { id: 'qr-12-90-1-aaa', source: 'qr_table', name: 'Chicken' },
      ])
    ).toBe(true)
  })

  it('keeps realtime kitchen when staff POS add-on is in the delta', () => {
    expect(
      shouldSkipRealtimeKitchenAutoprintForQrGuestAddon([
        { id: 'cart-1', name: 'Chicken' },
        { id: 'qr-12-90-1-aaa', source: 'qr_table' },
      ])
    ).toBe(false)
  })
})

describe('resolveDineInAddonKitchenDelayMs', () => {
  it('prints QR kitchen immediately when hall check-bill is skipped', () => {
    expect(
      resolveDineInAddonKitchenDelayMs({
        printHallAddon: false,
        skipQrGuestHall: true,
        afterReceiptToKitchenMs: 400,
        kitchenOnlyDelayMs: 80,
      })
    ).toBe(0)
  })

  it('keeps staff addon delay after hall receipt', () => {
    expect(
      resolveDineInAddonKitchenDelayMs({
        printHallAddon: true,
        skipQrGuestHall: false,
        afterReceiptToKitchenMs: 400,
        kitchenOnlyDelayMs: 80,
      })
    ).toBe(400)
  })

  it('keeps kitchen-only delay for non-QR remote add', () => {
    expect(
      resolveDineInAddonKitchenDelayMs({
        printHallAddon: false,
        skipQrGuestHall: false,
        afterReceiptToKitchenMs: 400,
        kitchenOnlyDelayMs: 80,
      })
    ).toBe(80)
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
