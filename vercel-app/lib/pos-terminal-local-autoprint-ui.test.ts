import { describe, expect, it } from 'vitest'
import { activatePosMainDeviceLayoutSync } from '@/lib/pos-main-device-sync-owner'
import {
  setPosTerminalLocalAutoprintActive,
  shouldSyncHostSkipDineInAddonMetaScan,
} from '@/lib/pos-terminal-local-autoprint-ui'

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
