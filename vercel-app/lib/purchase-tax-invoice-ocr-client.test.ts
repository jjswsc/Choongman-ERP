import { describe, expect, it } from 'vitest'
import { estimateSkewDegrees, taxInvoiceShouldInvertForOcr } from './purchase-tax-invoice-ocr-client'

describe('estimateSkewDegrees', () => {
  it('returns 0 for a level horizontal dark bar', () => {
    const width = 48
    const height = 48
    const gray = new Uint8Array(width * height)
    gray.fill(255)
    for (let y = 22; y <= 26; y += 1) {
      for (let x = 4; x < width - 4; x += 1) gray[y * width + x] = 0
    }
    expect(estimateSkewDegrees(gray, width, height)).toBe(0)
  })
})

describe('taxInvoiceShouldInvertForOcr', () => {
  it('does not invert tinted paper like TPD green forms', () => {
    expect(taxInvoiceShouldInvertForOcr({ luma: 90, chroma: 40 })).toBe(false)
    expect(taxInvoiceShouldInvertForOcr({ luma: 160, chroma: 55 })).toBe(false)
  })

  it('inverts dark low-chroma night photos only', () => {
    expect(taxInvoiceShouldInvertForOcr({ luma: 70, chroma: 8 })).toBe(true)
    expect(taxInvoiceShouldInvertForOcr({ luma: 180, chroma: 6 })).toBe(false)
  })
})
