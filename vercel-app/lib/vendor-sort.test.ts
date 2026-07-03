import { describe, expect, it } from 'vitest'
import { compareVendorsByDisplayName, sortVendorNameStrings, sortVendorsByDisplayName } from './vendor-sort'

describe('vendor-sort', () => {
  it('sorts vendors by display name then code', () => {
    const input = [
      { code: 'V003', name: 'Sun Food International Co.,Ltd.' },
      { code: 'V001', name: 'CML Global Co.,Ltd.' },
      { code: 'V002', name: 'ADVANCED MPAY COMPANY LIMITED' },
    ]
    expect(sortVendorsByDisplayName(input).map((v) => v.name)).toEqual([
      'ADVANCED MPAY COMPANY LIMITED',
      'CML Global Co.,Ltd.',
      'Sun Food International Co.,Ltd.',
    ])
  })

  it('uses code as tiebreaker for identical names', () => {
    expect(
      compareVendorsByDisplayName({ code: 'B02', name: 'Same Co.' }, { code: 'A01', name: 'Same Co.' })
    ).toBeGreaterThan(0)
  })

  it('sorts vendor name strings', () => {
    expect(sortVendorNameStrings(['Zeta', 'Alpha', 'Beta'])).toEqual(['Alpha', 'Beta', 'Zeta'])
  })
})
