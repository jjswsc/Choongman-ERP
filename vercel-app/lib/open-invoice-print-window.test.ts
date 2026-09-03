/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  commitReservedInvoicePrintWindow,
  INVOICE_PRINT_PATH,
  INVOICE_PRINT_PREPARING_HREF,
  INVOICE_PRINT_STORAGE_KEY,
  INVOICE_PRINT_TRANSFER_KEY,
  isInvoicePrintPreparingSearch,
  parseInvoicePrintDatas,
  readInvoicePrintStorageRaw,
  reserveInvoicePrintWindow,
  writeInvoicePrintPayload,
} from '@/lib/open-invoice-print-window'

const sample = {
  documentNo: 'IV.20260801-001',
  seller: { companyName: 'A' },
  client: { companyName: 'B' },
  items: [{ name: 'x' }],
}

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('parseInvoicePrintDatas', () => {
  it('accepts an array and a single object', () => {
    expect(parseInvoicePrintDatas(JSON.stringify([sample]))).toHaveLength(1)
    expect(parseInvoicePrintDatas(JSON.stringify(sample))).toHaveLength(1)
  })

  it('drops invalid rows', () => {
    expect(parseInvoicePrintDatas(JSON.stringify([{ foo: 1 }, sample]))).toEqual([sample])
    expect(parseInvoicePrintDatas('not-json')).toEqual([])
    expect(parseInvoicePrintDatas(null)).toEqual([])
  })
})

describe('invoice print storage transfer', () => {
  it('prefers localStorage transfer over leftover session data', () => {
    sessionStorage.setItem(INVOICE_PRINT_STORAGE_KEY, JSON.stringify([{ ...sample, documentNo: 'OLD' }]))
    expect(writeInvoicePrintPayload([sample])).toBe(true)
    const raw = readInvoicePrintStorageRaw()
    expect(parseInvoicePrintDatas(raw)[0]?.documentNo).toBe('IV.20260801-001')
    expect(localStorage.getItem(INVOICE_PRINT_TRANSFER_KEY)).toBeNull()
  })
})

describe('isInvoicePrintPreparingSearch', () => {
  it('detects preparing=1', () => {
    expect(isInvoicePrintPreparingSearch('preparing=1')).toBe(true)
    expect(isInvoicePrintPreparingSearch('?preparing=1&embed=1')).toBe(true)
    expect(isInvoicePrintPreparingSearch('embed=1')).toBe(false)
  })
})

describe('reserve and commit print window', () => {
  it('opens the preparing URL on reserve', () => {
    const fake = { closed: false, focus: vi.fn(), location: { replace: vi.fn() }, sessionStorage } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(fake)
    expect(reserveInvoicePrintWindow()).toBe(fake)
    expect(open).toHaveBeenCalledWith(INVOICE_PRINT_PREPARING_HREF, '_blank')
  })

  it('writes payload then navigates the reserved window', () => {
    const replace = vi.fn()
    const focus = vi.fn()
    const fake = {
      closed: false,
      focus,
      location: { replace },
      sessionStorage,
    } as unknown as Window
    expect(commitReservedInvoicePrintWindow(fake, [sample])).toBe('ok')
    expect(replace).toHaveBeenCalledWith(INVOICE_PRINT_PATH)
    expect(focus).toHaveBeenCalled()
    expect(parseInvoicePrintDatas(sessionStorage.getItem(INVOICE_PRINT_STORAGE_KEY))).toHaveLength(1)
  })

  it('returns closed when the reserved tab was dismissed', () => {
    const fake = { closed: true, location: { replace: vi.fn() } } as unknown as Window
    expect(commitReservedInvoicePrintWindow(fake, [sample])).toBe('closed')
  })
})
