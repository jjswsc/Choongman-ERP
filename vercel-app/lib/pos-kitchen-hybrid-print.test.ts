import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createKitchenHybridPrintBatch,
  resolveKitchenPrintOrderRef,
  runKitchenHybridSlipBatch,
} from './pos-kitchen-hybrid-print'

const printPosHtmlDocument = vi.fn(async () => undefined)
const markKitchenPrintFailure = vi.fn()
const clearKitchenPrintFailure = vi.fn()

vi.mock('@/lib/pos-print-html', () => ({
  printPosHtmlDocument: (...args: unknown[]) => printPosHtmlDocument(...args),
  resolveBetweenKitchenSlipsDelayMs: () => 0,
  POS_PRINT_DOCUMENT_UNAVAILABLE_MESSAGE: '__CM_POS_PRINT_DOCUMENT_UNAVAILABLE__',
}))

vi.mock('@/lib/pos-kitchen-print-tracking', () => ({
  buildKitchenPrintTrackingId: (p: { orderRef: string; station?: number; label?: string }) =>
    `K-${p.orderRef}-S${p.station ?? 0}`,
  markKitchenPrintFailure: (...args: unknown[]) => markKitchenPrintFailure(...args),
  clearKitchenPrintFailure: (...args: unknown[]) => clearKitchenPrintFailure(...args),
}))

describe('resolveKitchenPrintOrderRef', () => {
  it('prefers orderNo over id', () => {
    expect(resolveKitchenPrintOrderRef({ id: 12, orderNo: '045' })).toBe('045')
  })
})

describe('createKitchenHybridPrintBatch', () => {
  beforeEach(() => {
    printPosHtmlDocument.mockClear()
    markKitchenPrintFailure.mockClear()
    clearKitchenPrintFailure.mockClear()
  })

  it('records shell failure and skips iframe fallback flag', async () => {
    printPosHtmlDocument.mockImplementation(async (_html, opts) => {
      opts?.onShellPrintResult?.({ ok: false, reason: 'offline' })
    })
    const batch = createKitchenHybridPrintBatch()
    await batch.printSlip('<html></html>', {
      title: 'Kitchen 1',
      kitchenStation: 1,
    })
    batch.finalize('045')
    expect(printPosHtmlDocument).toHaveBeenCalledWith(
      '<html></html>',
      expect.objectContaining({
        skipIframeFallbackOnShellFailure: true,
        printRole: 'kitchen',
      })
    )
    expect(markKitchenPrintFailure).toHaveBeenCalledWith(
      expect.objectContaining({ orderRef: '045', reason: 'shell_print_or_cut_failed' })
    )
    expect(clearKitchenPrintFailure).not.toHaveBeenCalled()
  })

  it('clears failure marker when all slips succeed', async () => {
    printPosHtmlDocument.mockImplementation(async (_html, opts) => {
      opts?.onShellPrintResult?.({ ok: true, cutOk: true })
    })
    const batch = createKitchenHybridPrintBatch()
    await batch.printSlip('<html></html>', { title: 'Kitchen 1', kitchenStation: 1 })
    batch.finalize('045')
    expect(clearKitchenPrintFailure).toHaveBeenCalledWith('045')
    expect(markKitchenPrintFailure).not.toHaveBeenCalled()
  })

  it('does not auto-retry print on its own', async () => {
    printPosHtmlDocument.mockImplementation(async (_html, opts) => {
      opts?.onShellPrintResult?.({ ok: false })
    })
    const batch = createKitchenHybridPrintBatch()
    await batch.printSlip('<html></html>', { title: 'Kitchen 1', kitchenStation: 1 })
    batch.finalize('045')
    expect(printPosHtmlDocument).toHaveBeenCalledTimes(1)
  })
})

describe('runKitchenHybridSlipBatch', () => {
  beforeEach(() => {
    printPosHtmlDocument.mockClear()
    markKitchenPrintFailure.mockClear()
    clearKitchenPrintFailure.mockClear()
  })

  it('prints multiple slips sequentially and clears failure on success', async () => {
    printPosHtmlDocument.mockImplementation(async (_html, opts) => {
      opts?.onShellPrintResult?.({ ok: true, cutOk: true })
    })
    await runKitchenHybridSlipBatch({
      orderRef: '045',
      slips: [
        { html: '<html>1</html>', title: 'K1', kitchenStation: 1 },
        { html: '<html>2</html>', title: 'K2', kitchenStation: 2 },
      ],
    })
    expect(printPosHtmlDocument).toHaveBeenCalledTimes(2)
    expect(clearKitchenPrintFailure).toHaveBeenCalledWith('045')
  })
})
