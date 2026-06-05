import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveGrabStoreCode } from '@/lib/grab-order-to-pos'

describe('resolveGrabStoreCode ERP normalization', () => {
  const prevMap = process.env.GRAB_STORE_MAP_JSON
  const prevPortal = process.env.GRAB_PORTAL_MERCHANT_MAP

  beforeEach(() => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      'GFSBPOS-811-087': '1042',
      '1042': 'CM Silom',
      '1040': 'CM True Digital',
    })
    process.env.GRAB_PORTAL_MERCHANT_MAP = '3-C4NKAA4FCNCUGA=1042'
  })

  afterEach(() => {
    if (prevMap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = prevMap
    if (prevPortal === undefined) delete process.env.GRAB_PORTAL_MERCHANT_MAP
    else process.env.GRAB_PORTAL_MERCHANT_MAP = prevPortal
  })

  it('resolves partner merchant chain to ERP store_code', () => {
    expect(
      resolveGrabStoreCode({
        partnerMerchantID: 'GFSBPOS-811-087',
      })
    ).toBe('CM Silom')
  })

  it('resolves portal merchant id to ERP store_code', () => {
    expect(
      resolveGrabStoreCode({
        merchantID: '3-C4NKAA4FCNCUGA',
      })
    ).toBe('CM Silom')
  })

  it('resolves numeric partner store id payload to ERP store_code', () => {
    expect(
      resolveGrabStoreCode({
        partnerStoreID: '1042',
      })
    ).toBe('CM Silom')
  })
})
