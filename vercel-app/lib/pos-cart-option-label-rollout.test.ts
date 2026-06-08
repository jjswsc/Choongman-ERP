import { describe, expect, it, vi, afterEach } from 'vitest'
import { isPosCartOptionLabelMatchPickerEnabled } from '@/lib/pos-cart-option-label-rollout'

describe('isPosCartOptionLabelMatchPickerEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('enables office store codes by default', () => {
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Office')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('본사')).toBe(true)
  })

  it('disables franchise store by default', () => {
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(false)
    expect(isPosCartOptionLabelMatchPickerEnabled('MBK')).toBe(false)
  })

  it('enables all stores when env ALL', () => {
    vi.stubEnv('NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES', 'ALL')
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(true)
  })

  it('enables explicit pilot list from env', () => {
    vi.stubEnv('NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES', 'CM Bangna, MBK')
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(false)
  })
})
