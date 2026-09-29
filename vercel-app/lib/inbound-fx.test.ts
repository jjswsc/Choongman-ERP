import { describe, expect, it } from 'vitest'
import { computeInboundBatchAmounts } from '@/lib/inbound-payable-amount'
import { roundErp3 } from '@/lib/utils'
import {
  allocateInboundThbByKrwLines,
  formatInboundFxRateInput,
  fxRateFromKrwAndThb,
  fxRateFromKrwQtyAndThbAmount,
  normalizeInboundFxRateInput,
  parseInboundFxRate,
  resolveInboundLineCost,
  thbUnitCostFromKrw,
} from '@/lib/inbound-fx'

describe('inbound FX', () => {
  it('converts KRW unit cost with FX into THB unit cost', () => {
    expect(thbUnitCostFromKrw(4000, 40)).toBe(100)
    expect(thbUnitCostFromKrw(1234, 40)).toBe(30.85)
  })

  it('derives FX from KRW unit and THB unit', () => {
    expect(fxRateFromKrwAndThb(4000, 100)).toBe(40)
    expect(fxRateFromKrwAndThb(12345, 300)).toBe(41.15)
  })

  it('derives FX from KRW unit, qty, and THB line amount', () => {
    expect(fxRateFromKrwQtyAndThbAmount(4000, 2, 200)).toBe(40)
    expect(fxRateFromKrwQtyAndThbAmount(15000, 1, 375)).toBe(40)
  })

  it('returns null when KRW or THB is missing or not positive', () => {
    expect(fxRateFromKrwAndThb(0, 100)).toBeNull()
    expect(fxRateFromKrwAndThb(4000, 0)).toBeNull()
    expect(fxRateFromKrwQtyAndThbAmount(4000, 0, 100)).toBeNull()
    expect(fxRateFromKrwQtyAndThbAmount(4000, 2, 0)).toBeNull()
  })

  it('splits one THB supply total across lines by qty × KRW unit', () => {
    const alloc = allocateInboundThbByKrwLines(
      [
        { qty: 10, krwUnit: 80000 },
        { qty: 10, krwUnit: 40000 },
        { qty: 10, krwUnit: 20000 },
        { qty: 10, krwUnit: 20000 },
      ],
      40000
    )
    expect(alloc).not.toBeNull()
    expect(alloc!.appliedThb).toBe(40000)
    expect(alloc!.requestedThb).toBe(40000)
    expect(alloc!.fxRate).toBe(40)
    expect(alloc!.lines.map((line) => line.thbAmount)).toEqual([20000, 10000, 5000, 5000])
    expect(alloc!.lines.map((line) => line.thbUnit)).toEqual([2000, 1000, 500, 500])
    const totals = computeInboundBatchAmounts(
      alloc!.lines.map((line, i) => ({
        code: `I${i}`,
        qty: 10,
        unitCost: line.thbUnit,
        dateYmd: '2026-09-29',
      })),
      new Map()
    )
    expect(totals.netTotal).toBe(40000)
  })

  it('gives a larger KRW line a larger THB share', () => {
    const alloc = allocateInboundThbByKrwLines(
      [
        { qty: 2, krwUnit: 100 },
        { qty: 4, krwUnit: 100 },
      ],
      300
    )
    expect(alloc).not.toBeNull()
    expect(alloc!.appliedThb).toBe(300)
    expect(alloc!.lines[0].thbAmount).toBe(100)
    expect(alloc!.lines[1].thbAmount).toBe(200)
  })

  it('keeps the recorded supply on the entered total when unit rounding is tight', () => {
    const alloc = allocateInboundThbByKrwLines(
      [
        { qty: 3, krwUnit: 10001 },
        { qty: 1, krwUnit: 1 },
      ],
      1000
    )
    expect(alloc).not.toBeNull()
    expect(alloc!.appliedThb).toBe(1000)
    const rebuilt = alloc!.lines.map((line, i) =>
      roundErp3([3, 1][i] * line.thbUnit)
    )
    expect(rebuilt[0] + rebuilt[1]).toBeCloseTo(1000, 2)
  })

  it('returns null when KRW weights or the THB total are missing', () => {
    expect(allocateInboundThbByKrwLines([], 100)).toBeNull()
    expect(allocateInboundThbByKrwLines([{ qty: 1, krwUnit: 100 }], 0)).toBeNull()
    expect(allocateInboundThbByKrwLines([{ qty: 1, krwUnit: 0 }], 100)).toBeNull()
    expect(allocateInboundThbByKrwLines([{ qty: 0, krwUnit: 100 }], 100)).toBeNull()
  })

  it('stores an explicit THB unit from a total split instead of dividing by FX', () => {
    const resolved = resolveInboundLineCost({
      costRaw: 80000,
      sourceCurrency: 'KRW',
      fxRate: 40,
      thbUnitCostRaw: 2000.004,
    })
    expect(resolved).toEqual({ ok: true, unitCostThb: 2000.004, sourceUnitCost: 80000 })
  })

  it('formats and parses FX rate with up to 6 decimals', () => {
    expect(formatInboundFxRateInput(40)).toBe('40')
    expect(formatInboundFxRateInput(40.125)).toBe('40.125')
    expect(formatInboundFxRateInput(41.1234567)).toBe('41.123457')
    expect(parseInboundFxRate('40.125')).toBe(40.125)
    expect(normalizeInboundFxRateInput('40.1234567')).toBe('40.123456')
    expect(normalizeInboundFxRateInput('40.')).toBe('40.')
  })
})
