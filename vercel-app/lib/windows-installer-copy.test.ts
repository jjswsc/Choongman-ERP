import { describe, expect, it } from 'vitest'
import {
  isLocalDevHost,
  WINDOWS_POS_CHOONGMAN_SETUP_PATH,
  WINDOWS_POS_OMNI_SETUP_PATH,
  windowsPosSetupPathForBrand,
} from '@/lib/windows-installer-copy'

describe('windowsPosSetupPathForBrand', () => {
  it('maps Omni brand to Omni installer path', () => {
    expect(windowsPosSetupPathForBrand('omnifoodtech')).toBe(WINDOWS_POS_OMNI_SETUP_PATH)
  })

  it('maps Choongman brand to Choongman installer path', () => {
    expect(windowsPosSetupPathForBrand('choongman')).toBe(WINDOWS_POS_CHOONGMAN_SETUP_PATH)
  })
})

describe('isLocalDevHost', () => {
  it('detects localhost variants', () => {
    expect(isLocalDevHost('localhost')).toBe(true)
    expect(isLocalDevHost('127.0.0.1')).toBe(true)
    expect(isLocalDevHost('app.omnifoodtech.com')).toBe(false)
  })
})
