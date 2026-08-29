import { describe, expect, it } from 'vitest'
import {
  isPurchaseTaxScanAbortError,
  shouldAutoResumePurchaseTaxScan,
} from './purchase-tax-invoice-scan-persist'

describe('shouldAutoResumePurchaseTaxScan', () => {
  it('resumes only when the stored file and checkpoint are both present', () => {
    expect(
      shouldAutoResumePurchaseTaxScan({
        sessionActive: true,
        hasStoredFiles: true,
        hasCheckpoint: true,
      })
    ).toBe(true)
    expect(
      shouldAutoResumePurchaseTaxScan({
        sessionActive: true,
        hasStoredFiles: false,
        hasCheckpoint: true,
      })
    ).toBe(false)
    expect(
      shouldAutoResumePurchaseTaxScan({
        sessionActive: false,
        wasDiscarded: true,
        hasStoredFiles: true,
        hasCheckpoint: true,
      })
    ).toBe(true)
    expect(
      shouldAutoResumePurchaseTaxScan({
        sessionActive: false,
        wasDiscarded: false,
        hasStoredFiles: true,
        hasCheckpoint: true,
      })
    ).toBe(false)
  })
})

describe('isPurchaseTaxScanAbortError', () => {
  it('detects abort errors only', () => {
    expect(isPurchaseTaxScanAbortError(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isPurchaseTaxScanAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isPurchaseTaxScanAbortError(new Error('ptiOcrFailed'))).toBe(false)
  })
})
