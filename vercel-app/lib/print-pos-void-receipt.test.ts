import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PosOrder } from '@/lib/api-client'
import { POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE } from '@/lib/pos-print-html'

const { printPosHtmlDocumentMock } = vi.hoisted(() => ({
  printPosHtmlDocumentMock: vi.fn(),
}))

vi.mock('@/lib/pos-print-html', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pos-print-html')>()
  return {
    ...actual,
    printPosHtmlDocument: printPosHtmlDocumentMock,
  }
})

import { printPosVoidReceiptForOrder } from '@/lib/print-pos-void-receipt'

describe('printPosVoidReceiptForOrder', () => {
  beforeEach(() => {
    printPosHtmlDocumentMock.mockReset()
    printPosHtmlDocumentMock.mockResolvedValue(undefined)
  })

  const baseOrder = {
    id: 1,
    orderNo: 'T-1',
    storeCode: 'S1',
    orderType: 'dine_in',
    subtotal: 100,
    discountAmt: 0,
    total: 88,
    paymentQr: 88,
    items: [{ id: '1', name: 'Chicken', price: 100, qty: 1 }],
  } as PosOrder

  it('returns false when print is unavailable', async () => {
    printPosHtmlDocumentMock.mockRejectedValue(new Error(POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE))
    const onPrintUnavailable = vi.fn()
    const ok = await printPosVoidReceiptForOrder({
      order: baseOrder,
      menus: [],
      t: (k) => k,
      lang: 'en',
      printerSettings: {},
      onPrintUnavailable,
    })
    expect(ok).toBe(false)
    expect(onPrintUnavailable).toHaveBeenCalledTimes(1)
  })

  it('returns true after payment void receipt print', async () => {
    const ok = await printPosVoidReceiptForOrder({
      order: baseOrder,
      menus: [],
      t: (k) => k,
      lang: 'en',
      printerSettings: {},
    })
    expect(ok).toBe(true)
    expect(printPosHtmlDocumentMock).toHaveBeenCalledTimes(1)
  })
})
