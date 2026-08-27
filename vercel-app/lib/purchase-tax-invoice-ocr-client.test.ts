import { describe, expect, it } from 'vitest'
import { estimateSkewDegrees } from './purchase-tax-invoice-ocr-client'

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
