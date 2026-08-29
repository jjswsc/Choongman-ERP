import { describe, expect, it } from 'vitest'
import {
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
})
