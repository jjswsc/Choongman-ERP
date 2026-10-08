import { describe, expect, it } from 'vitest'
import {
  fitReceiptLogoSize,
  isReceiptLogoBackgroundPixel,
  receiptBrandLogoCss,
  receiptLogoContentBounds,
  RECEIPT_LOGO_CROP_PAD_PX,
  RECEIPT_LOGO_MAX_HEIGHT_PX,
  RECEIPT_LOGO_MAX_WIDTH_PX,
} from '@/lib/pos-receipt-logo-fit'

function fill(width: number, height: number, paint: (x: number, y: number, data: Uint8ClampedArray, i: number) => void) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      paint(x, y, data, (y * width + x) * 4)
    }
  }
  return data
}

describe('receipt logo fit', () => {
  it('treats transparent and near-white as background, and keeps off-white ink', () => {
    expect(isReceiptLogoBackgroundPixel(255, 255, 255, 0)).toBe(true)
    expect(isReceiptLogoBackgroundPixel(250, 250, 250, 255)).toBe(true)
    expect(isReceiptLogoBackgroundPixel(249, 249, 249, 255)).toBe(false)
    expect(isReceiptLogoBackgroundPixel(0, 0, 0, 255)).toBe(false)
  })

  it('crops a square canvas down to the ink, keeping a few pixels of padding', () => {
    const data = fill(40, 40, (x, y, buf, i) => {
      const ink = x >= 16 && x <= 27 && y >= 14 && y <= 21
      buf[i] = ink ? 0 : 255
      buf[i + 1] = ink ? 0 : 255
      buf[i + 2] = ink ? 0 : 255
      buf[i + 3] = 255
    })
    const crop = receiptLogoContentBounds(40, 40, data)
    expect(crop).toEqual({
      x: 16 - RECEIPT_LOGO_CROP_PAD_PX,
      y: 14 - RECEIPT_LOGO_CROP_PAD_PX,
      w: 12 + RECEIPT_LOGO_CROP_PAD_PX * 2,
      h: 8 + RECEIPT_LOGO_CROP_PAD_PX * 2,
    })
  })

  it('keeps white letters that sit inside a dark mark', () => {
    const data = fill(12, 12, (x, y, buf, i) => {
      const edge = x === 1 || y === 1 || x === 10 || y === 10
      const inside = x > 1 && x < 10 && y > 1 && y < 10
      const ink = edge
      buf[i] = ink ? 0 : 255
      buf[i + 1] = ink ? 0 : 255
      buf[i + 2] = ink ? 0 : 255
      buf[i + 3] = inside || edge ? 255 : 0
    })
    const crop = receiptLogoContentBounds(12, 12, data)
    expect(crop?.x).toBe(0)
    expect(crop?.y).toBe(0)
    expect(crop?.w).toBe(12)
    expect(crop?.h).toBe(12)
  })

  it('returns null when the file has no ink', () => {
    const data = fill(8, 8, (_x, _y, buf, i) => {
      buf[i] = 255
      buf[i + 1] = 255
      buf[i + 2] = 255
      buf[i + 3] = 255
    })
    expect(receiptLogoContentBounds(8, 8, data)).toBeNull()
  })

  it('shrinks a wide logo to the width cap and a tall logo to the height cap without upscaling', () => {
    const wide = fitReceiptLogoSize(408, 126, RECEIPT_LOGO_MAX_WIDTH_PX.lg, RECEIPT_LOGO_MAX_HEIGHT_PX.lg)
    expect(wide.width).toBe(132)
    expect(wide.height).toBeLessThan(50)

    const tall = fitReceiptLogoSize(200, 400, RECEIPT_LOGO_MAX_WIDTH_PX.lg, RECEIPT_LOGO_MAX_HEIGHT_PX.lg)
    expect(tall.height).toBe(RECEIPT_LOGO_MAX_HEIGHT_PX.lg)
    expect(tall.width).toBeLessThan(RECEIPT_LOGO_MAX_WIDTH_PX.lg)

    const small = fitReceiptLogoSize(80, 30, RECEIPT_LOGO_MAX_WIDTH_PX.lg, RECEIPT_LOGO_MAX_HEIGHT_PX.lg)
    expect(small).toEqual({ width: 80, height: 30 })
  })

  it('caps logo box height below the large width', () => {
    const css = receiptBrandLogoCss({ filter: 'grayscale(100%) contrast(1.35)' })
    expect(css).toContain('max-height: 108px')
    expect(css).toContain('max-width: min(132px, 100%)')
    expect(css).toContain('grayscale(100%) contrast(1.35)')
    expect(css).not.toContain('width: 132px')
  })
})
