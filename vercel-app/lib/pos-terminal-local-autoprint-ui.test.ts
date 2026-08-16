import { afterEach, describe, expect, it } from 'vitest'
import { activatePosMainDeviceLayoutSync } from '@/lib/pos-main-device-sync-owner'
import {
  markPosTerminalOrderSubmitInFlight,
  setPosTerminalLocalAutoprintActive,
  shouldSyncHostSkipDineInAddonMetaScan,
  shouldSyncHostSkipLocalKitchenAutoprint,
} from '@/lib/pos-terminal-local-autoprint-ui'

afterEach(() => {
  setPosTerminalLocalAutoprintActive(false)
})

describe('shouldSyncHostSkipDineInAddonMetaScan', () => {
  it('does not skip meta scan when layout host owns sync even if terminal is open', () => {
    setPosTerminalLocalAutoprintActive(true)
    const release = activatePosMainDeviceLayoutSync()
    expect(shouldSyncHostSkipDineInAddonMetaScan()).toBe(false)
    release()
    expect(shouldSyncHostSkipDineInAddonMetaScan()).toBe(true)
    setPosTerminalLocalAutoprintActive(false)
    expect(shouldSyncHostSkipDineInAddonMetaScan()).toBe(false)
  })
})

describe('shouldSyncHostSkipLocalKitchenAutoprint', () => {
  it('does not skip tablet orders that share the same login as main POS', () => {
    setPosTerminalLocalAutoprintActive(true)
    expect(
      shouldSyncHostSkipLocalKitchenAutoprint({
        orderId: 81046,
        suppressUntilMs: null,
      })
    ).toBe(false)
  })

  it('skips only this device’s in-flight submit', () => {
    setPosTerminalLocalAutoprintActive(true)
    markPosTerminalOrderSubmitInFlight(5_000)
    expect(shouldSyncHostSkipLocalKitchenAutoprint({ orderId: 1 })).toBe(true)
  })

  it('skips only this device’s recent local order id', () => {
    setPosTerminalLocalAutoprintActive(true)
    expect(
      shouldSyncHostSkipLocalKitchenAutoprint({
        orderId: 2,
        suppressUntilMs: Date.now() + 10_000,
      })
    ).toBe(true)
  })

  it('still prints API inbound delivery even while a local submit is in flight', () => {
    setPosTerminalLocalAutoprintActive(true)
    markPosTerminalOrderSubmitInFlight(5_000)
    expect(
      shouldSyncHostSkipLocalKitchenAutoprint({
        orderId: 3,
        isApiInboundDelivery: true,
      })
    ).toBe(false)
  })
})
