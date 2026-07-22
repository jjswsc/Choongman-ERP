import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { openPosCashDrawer } from '@/lib/pos-cash-drawer'

function mockWindowShell(
  shell: { openCashDrawer?: () => Promise<{ ok: boolean; reason?: string; usedDevice?: string }> } | undefined
) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: shell ? { cmPosShell: shell } : undefined,
  })
}

describe('openPosCashDrawer', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    mockWindowShell(undefined)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mockWindowShell(undefined)
  })

  it('uses hybrid shell only and does not call local bridge fetch', async () => {
    const openCashDrawer = vi.fn(async () => ({ ok: false as const, reason: 'no_printer' }))
    mockWindowShell({ openCashDrawer })
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const res = await openPosCashDrawer({
      reason: 'cash_payment',
      source: 'payment_auto',
      storeCode: 'TEST',
    })

    expect(openCashDrawer).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(res).toEqual({ success: false, error: 'shell:no_printer' })
  })

  it('returns shell success without bridge', async () => {
    mockWindowShell({
      openCashDrawer: vi.fn(async () => ({ ok: true as const, usedDevice: 'XP-80' })),
    })
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const res = await openPosCashDrawer({
      reason: 'cash_payment',
      source: 'payment_auto',
      storeCode: 'TEST',
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(res).toEqual({ success: true, endpoint: 'cm-pos-shell' })
  })
})
