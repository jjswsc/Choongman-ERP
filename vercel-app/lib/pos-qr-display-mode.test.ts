import { describe, expect, it } from 'vitest'
import {
  defaultPayQrTypeForStore,
  normalizePosQrDisplayMode,
  resolvePosQrDisplayModeForStore,
  shouldMirrorKbankQrToEdc,
  shouldUseLinkposNativeQr,
} from './pos-qr-display-mode'

describe('pos-qr-display-mode', () => {
  it('normalizes display mode aliases', () => {
    expect(normalizePosQrDisplayMode('edc-mirror')).toBe('edc_mirror')
    expect(normalizePosQrDisplayMode('edc_native')).toBe('edc_native')
    expect(normalizePosQrDisplayMode('')).toBe('cashier')
  })

  it('defaults pay tab by store mode on hybrid shell', () => {
    expect(defaultPayQrTypeForStore('cashier', true)).toBe('THAI_QR')
    expect(defaultPayQrTypeForStore('edc_mirror', true)).toBe('THAI_QR')
    expect(defaultPayQrTypeForStore('edc_native', true)).toBe('EDC')
    expect(defaultPayQrTypeForStore('edc_mirror', false)).toBe('THAI_QR')
  })

  it('gates native EDC QR vs KBank mirror', () => {
    expect(shouldUseLinkposNativeQr('edc_native', true)).toBe(true)
    expect(shouldUseLinkposNativeQr('edc_mirror', true)).toBe(false)
    expect(shouldMirrorKbankQrToEdc('edc_mirror')).toBe(true)
    expect(shouldMirrorKbankQrToEdc('edc_native')).toBe(false)
    expect(shouldMirrorKbankQrToEdc('cashier')).toBe(false)
  })

  it('defaults True Digital Park to EDC mirror when unset, keeps saved cashier', () => {
    expect(resolvePosQrDisplayModeForStore('CM True Digital', '')).toBe('edc_mirror')
    expect(resolvePosQrDisplayModeForStore('1040', null)).toBe('edc_mirror')
    expect(resolvePosQrDisplayModeForStore('CM True Digital', 'cashier')).toBe('cashier')
    expect(resolvePosQrDisplayModeForStore('CM MBK', '')).toBe('cashier')
  })
})
