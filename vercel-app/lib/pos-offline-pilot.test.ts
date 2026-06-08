import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  isPosOfflinePilotStore,
  isPosOfflinePhaseBEnabledForStore,
  isPosOfflinePhaseAEnabled,
} from '@/lib/pos-offline-pilot'

describe('pos-offline-pilot', () => {
  const env = process.env

  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    })
  })

  afterEach(() => {
    process.env = { ...env }
    vi.unstubAllGlobals()
  })

  it('treats Office aliases as pilot stores by default', () => {
    expect(isPosOfflinePilotStore('Office')).toBe(true)
    expect(isPosOfflinePilotStore('CM Office')).toBe(true)
    expect(isPosOfflinePilotStore('MBK')).toBe(false)
  })

  it('enables Phase B for pilot store when env is on', () => {
    process.env.NEXT_PUBLIC_CM_POS_OFFLINE_PHASE_B = '1'
    expect(isPosOfflinePhaseBEnabledForStore('Office')).toBe(true)
    expect(isPosOfflinePhaseBEnabledForStore('ST01')).toBe(false)
  })

  it('Phase B implies Phase A for the same store', () => {
    process.env.NEXT_PUBLIC_CM_POS_OFFLINE_PHASE_B = '1'
    expect(isPosOfflinePhaseAEnabled('Office')).toBe(true)
    expect(isPosOfflinePhaseAEnabled('ST01')).toBe(false)
  })
})
