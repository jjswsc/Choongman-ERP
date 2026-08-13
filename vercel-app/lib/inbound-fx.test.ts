import { describe, expect, it } from 'vitest'
import {
  formatInboundFxRateInput,
  fxRateFromKrwAndThb,
  fxRateFromKrwQtyAndThbAmount,
  normalizeInboundFxRateInput,
  parseInboundFxRate,
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

  it('formats and parses FX rate with up to 6 decimals', () => {
    expect(formatInboundFxRateInput(40)).toBe('40')
    expect(formatInboundFxRateInput(40.125)).toBe('40.125')
    expect(formatInboundFxRateInput(41.1234567)).toBe('41.123457')
    expect(parseInboundFxRate('40.125')).toBe(40.125)
    expect(normalizeInboundFxRateInput('40.1234567')).toBe('40.123456')
    expect(normalizeInboundFxRateInput('40.')).toBe('40.')
  })
})
