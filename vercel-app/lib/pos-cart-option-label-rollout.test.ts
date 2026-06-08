import { describe, expect, it, vi, afterEach } from 'vitest'
import { isPosCartOptionLabelMatchPickerEnabled } from '@/lib/pos-cart-option-label-rollout'

describe('isPosCartOptionLabelMatchPickerEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('enables all stores by default', () => {
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Office')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('MBK')).toBe(true)
  })

  it('disables when store code is empty', () => {
    expect(isPosCartOptionLabelMatchPickerEnabled('')).toBe(false)
    expect(isPosCartOptionLabelMatchPickerEnabled(null)).toBe(false)
  })

  it('enables all stores when env ALL', () => {
    vi.stubEnv('NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES', 'ALL')
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(true)
  })

  it('restricts to explicit pilot list from env', () => {
    vi.stubEnv('NEXT_PUBLIC_CM_POS_CART_OPTION_LABEL_PILOT_STORES', 'CM Bangna, MBK')
    expect(isPosCartOptionLabelMatchPickerEnabled('CM Bangna')).toBe(true)
    expect(isPosCartOptionLabelMatchPickerEnabled('Office')).toBe(false)
  })
})
