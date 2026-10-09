import { describe, expect, it } from 'vitest'
import {
  carryOverPosLineAddedAt,
  computePosOrderLineRounds,
  countPosOrderRounds,
  formatPosOrderRoundLabel,
  posLineAddedAtWallNow,
  resolvePosLineAddedAtMs,
  resolvePosOrderRoundForLineIds,
} from '@/lib/pos-order-rounds'

describe('resolvePosLineAddedAtMs', () => {
  it('reads Bangkok wall-clock addedAt', () => {
    expect(resolvePosLineAddedAtMs({ addedAt: '2026-10-09 18:10:18' })).toBe(
      Date.parse('2026-10-09T18:10:18+07:00')
    )
  })

  it('falls back to the timestamp inside a QR line id when addedAt was stripped', () => {
    expect(resolvePosLineAddedAtMs({ id: 'qr-2203-437-1791541577630-rg8z6' })).toBe(1791541577630)
  })

  it('returns null for staff lines without time', () => {
    expect(resolvePosLineAddedAtMs({ id: '61-7c6b7132-3c67-4485-ac66-1e1f7f74078b' })).toBeNull()
  })
})

describe('computePosOrderLineRounds', () => {
  it('numbers rounds by submission time and groups one submission together', () => {
    const rounds = computePosOrderLineRounds([
      { id: 'a', addedAt: '2026-10-09 17:26:17' },
      { id: 'b', addedAt: '2026-10-09 17:26:17' },
      { id: 'c', addedAt: '2026-10-09 17:33:05' },
      { id: 'd', addedAt: '2026-10-09 18:10:18' },
      { id: 'e', addedAt: '2026-10-09 18:10:19' },
    ])
    expect(rounds.map((r) => r.round)).toEqual([1, 1, 2, 3, 3])
    expect(countPosOrderRounds(rounds)).toBe(3)
  })

  it('untimed staff line inherits the previous line round (Silom T-1 case)', () => {
    const rounds = computePosOrderLineRounds([
      { id: 'qr-2203-437-1791541577630-rg8z6' },
      { id: '61-7c6b7132' },
      { id: 'qr-2203-57-1791544218492-uu39o', addedAt: '2026-10-09 18:10:18' },
    ])
    expect(rounds.map((r) => r.round)).toEqual([1, 1, 2])
  })

  it('leading untimed lines use order created time when known', () => {
    const rounds = computePosOrderLineRounds(
      [{ id: 'staff-1' }, { id: 'qr-9-1-1791544218492-x', addedAt: '2026-10-09 18:10:18' }],
      { orderCreatedAt: '2026-10-09T10:00:00.000Z' }
    )
    expect(rounds.map((r) => r.round)).toEqual([1, 2])
  })

  it('buffet entry line does not push the first food order to round 2', () => {
    const rounds = computePosOrderLineRounds([
      { id: 'buffet-entry-9', isBuffetEntry: true, addedAt: '2026-10-09 17:00:00' },
      { id: 'qr-9-1-1791541577630-a', addedAt: '2026-10-09 17:26:17' },
      { id: 'qr-9-2-1791544218492-b', addedAt: '2026-10-09 18:10:18' },
    ])
    expect(rounds.map((r) => r.round)).toEqual([1, 1, 2])
  })

  it('leading untimed lines without created time stay a separate first round', () => {
    const rounds = computePosOrderLineRounds([
      { id: 'staff-1' },
      { id: 'x', addedAt: '2026-10-09 18:10:18' },
    ])
    expect(rounds.map((r) => r.round)).toEqual([1, 2])
    expect(rounds[0].atMs).toBeNull()
  })
})

describe('resolvePosOrderRoundForLineIds', () => {
  it('returns the round of the given new lines', () => {
    const lines = [
      { id: 'a', addedAt: '2026-10-09 17:26:17' },
      { id: 'b', addedAt: '2026-10-09 18:10:18' },
    ]
    expect(resolvePosOrderRoundForLineIds(lines, ['b'])?.round).toBe(2)
    expect(resolvePosOrderRoundForLineIds(lines, ['zzz'])).toBeNull()
  })
})

describe('formatPosOrderRoundLabel', () => {
  it('formats round number with Bangkok HH:mm', () => {
    const label = formatPosOrderRoundLabel(
      { round: 2, atMs: Date.parse('2026-10-09T18:10:18+07:00') },
      'รอบที่ {n}'
    )
    expect(label).toBe('รอบที่ 2 · 18:10')
  })
})

describe('posLineAddedAtWallNow', () => {
  it('formats Bangkok wall clock', () => {
    expect(posLineAddedAtWallNow(new Date('2026-10-09T11:10:18.000Z'))).toBe('2026-10-09 18:10:18')
  })
})

describe('carryOverPosLineAddedAt', () => {
  it('keeps addedAt/source from DB lines and stamps only new ids', () => {
    const prev = [
      { id: 'qr-1-2-1791541577630-a', addedAt: '2026-10-09 17:26:17', source: 'qr_table' },
      { id: 'staff-old' },
    ]
    const next = [
      { id: 'cart-existing-0-qr-1-2-1791541577630-a', name: 'A' },
      { id: 'staff-old', name: 'B' },
      { id: 'staff-new', name: 'C' },
    ]
    const out = carryOverPosLineAddedAt(prev, next, '2026-10-09 18:30:00')
    expect(out[0]).toMatchObject({ addedAt: '2026-10-09 17:26:17', source: 'qr_table' })
    expect(out[1].addedAt).toBeUndefined()
    expect(out[2].addedAt).toBe('2026-10-09 18:30:00')
  })
})
