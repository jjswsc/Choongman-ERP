import { describe, expect, it } from 'vitest'
import { clampPosMenuProxyInt } from '@/lib/pos-menu-image-proxy-params'

describe('clampPosMenuProxyInt', () => {
  it('uses fallback when param is absent (null)', () => {
    expect(clampPosMenuProxyInt(null, 750, 64, 1200)).toBe(750)
    expect(clampPosMenuProxyInt(null, 80, 40, 100)).toBe(80)
  })

  it('uses fallback for empty or invalid values', () => {
    expect(clampPosMenuProxyInt('', 750, 64, 1200)).toBe(750)
    expect(clampPosMenuProxyInt('   ', 80, 40, 100)).toBe(80)
    expect(clampPosMenuProxyInt('abc', 750, 64, 1200)).toBe(750)
  })

  it('clamps numeric values', () => {
    expect(clampPosMenuProxyInt('0', 750, 64, 1200)).toBe(64)
    expect(clampPosMenuProxyInt('2000', 750, 64, 1200)).toBe(1200)
    expect(clampPosMenuProxyInt('90', 80, 40, 100)).toBe(90)
  })
})
