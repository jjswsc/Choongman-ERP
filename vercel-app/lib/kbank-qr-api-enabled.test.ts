import { describe, expect, it } from 'vitest'
import { resolveKbankSkipApiForQrSetting, shouldSkipKbankApiForQr } from '@/lib/kbank-qr-api-enabled'

describe('shouldSkipKbankApiForQr', () => {
  it('skips unless the store setting is explicitly false', () => {
    expect(shouldSkipKbankApiForQr(true)).toBe(true)
    expect(shouldSkipKbankApiForQr(null)).toBe(true)
    expect(shouldSkipKbankApiForQr(false)).toBe(false)
  })
})

describe('resolveKbankSkipApiForQrSetting', () => {
  it('uses API for live Choongman MID stores when unset', () => {
    expect(resolveKbankSkipApiForQrSetting('CM MBK', null)).toBe(false)
    expect(resolveKbankSkipApiForQrSetting('CM True Digital', undefined)).toBe(false)
    expect(resolveKbankSkipApiForQrSetting('CM Huamak', null)).toBe(false)
  })

  it('keeps explicit skip / API flags', () => {
    expect(resolveKbankSkipApiForQrSetting('CM MBK', true)).toBe(true)
    expect(resolveKbankSkipApiForQrSetting('CM MBK', false)).toBe(false)
  })

  it('skips by default for stores without a live MID', () => {
    expect(resolveKbankSkipApiForQrSetting('CM Asoke', null)).toBe(true)
  })
})
