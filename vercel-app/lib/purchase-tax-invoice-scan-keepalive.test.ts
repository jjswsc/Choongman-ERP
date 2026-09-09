import { describe, expect, it } from 'vitest'
import {
  createQuietWavBlob,
  isPurchaseTaxScanRunning,
  startPurchaseTaxScanKeepAlive,
  subscribePurchaseTaxScanRunning,
} from './purchase-tax-invoice-scan-keepalive'

describe('purchase tax scan running flag', () => {
  it('is on while keepalive is active and off after stop', () => {
    expect(isPurchaseTaxScanRunning()).toBe(false)
    const seen: boolean[] = []
    const unsub = subscribePurchaseTaxScanRunning((on) => seen.push(on))
    const ka = startPurchaseTaxScanKeepAlive()
    expect(isPurchaseTaxScanRunning()).toBe(true)
    ka.stop()
    expect(isPurchaseTaxScanRunning()).toBe(false)
    ka.stop()
    expect(isPurchaseTaxScanRunning()).toBe(false)
    expect(seen).toEqual([true, false])
    unsub()
  })

  it('builds a non-silent wav so Chrome treats the tab as playing media', async () => {
    const blob = createQuietWavBlob(2)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBeGreaterThan(44)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(bytes.subarray(44).some((b) => b !== 128)).toBe(true)
  })
})
