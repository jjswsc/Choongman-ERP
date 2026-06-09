import { describe, expect, it } from 'vitest'
import { resolveCameraSettingsHintKey } from '@/lib/qr-camera-client'

describe('qr-camera-client', () => {
  it('picks android pwa hint', () => {
    expect(resolveCameraSettingsHintKey('android', true)).toBe('attQrScanOpenSettingsHintAndroidPwa')
  })

  it('picks android browser hint', () => {
    expect(resolveCameraSettingsHintKey('android', false)).toBe('attQrScanOpenSettingsHintAndroidBrowser')
  })

  it('picks ios pwa hint', () => {
    expect(resolveCameraSettingsHintKey('ios', true)).toBe('attQrScanOpenSettingsHintIosPwa')
  })
})
