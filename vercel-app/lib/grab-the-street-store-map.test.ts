import { afterEach, describe, expect, it } from 'vitest'
import { resolveErpStoreCodeFromGrabMap } from '@/lib/grab-store-map-env'

describe('resolveErpStoreCodeFromGrabMap — The Street reverse map cycle', () => {
  const snap = process.env.GRAB_STORE_MAP_JSON

  afterEach(() => {
    if (snap === undefined) delete process.env.GRAB_STORE_MAP_JSON
    else process.env.GRAB_STORE_MAP_JSON = snap
  })

  it('resolves 1050 and portal merchant to CM The street (not partner id)', () => {
    process.env.GRAB_STORE_MAP_JSON = JSON.stringify({
      '1050': 'CM The street',
      'CM The street': '1050',
      '3-C7KJGBUEJND1VX': '1050',
    })
    expect(resolveErpStoreCodeFromGrabMap('1050')).toBe('CM The street')
    expect(resolveErpStoreCodeFromGrabMap('3-C7KJGBUEJND1VX')).toBe('CM The street')
    expect(resolveErpStoreCodeFromGrabMap('CM The street')).toBe('CM The street')
  })
})
