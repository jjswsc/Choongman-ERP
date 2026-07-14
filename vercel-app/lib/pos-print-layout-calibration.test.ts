import { describe, expect, it } from 'vitest'
import {
  KITCHEN_SLIP_DEFAULT_PADDING_MM,
  resolvePosPrintLayoutCalibration,
  resolveReceiptPrintLayout,
} from '@/lib/pos-print-layout-calibration'
import {
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
} from '@/lib/pos-receipt-layout'

describe('pos-print-layout-calibration', () => {
  it('uses global defaults when unset', () => {
    const layout = resolvePosPrintLayoutCalibration(null)
    expect(layout.receipt.insetLeftMm).toBe(RECEIPT_INNER_INSET_LEFT_MM)
    expect(layout.receipt.insetRightMm).toBe(RECEIPT_INNER_INSET_RIGHT_MM)
    expect(layout.receipt.contentNudgeLeftMm).toBe(RECEIPT_CONTENT_NUDGE_LEFT_MM)
    expect(layout.kitchen.paddingLeftMm).toBe(KITCHEN_SLIP_DEFAULT_PADDING_MM.l)
    expect(layout.kitchen.paddingRightMm).toBe(KITCHEN_SLIP_DEFAULT_PADDING_MM.r)
  })

  it('clamps store overrides', () => {
    const layout = resolveReceiptPrintLayout({
      receiptInsetLeftMm: 99,
      receiptInsetRightMm: -1,
      receiptContentNudgeLeftMm: 12,
    })
    expect(layout.insetLeftMm).toBe(15)
    expect(layout.insetRightMm).toBe(5)
    expect(layout.contentNudgeLeftMm).toBe(8)
  })
})
