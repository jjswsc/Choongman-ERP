import { describe, expect, it } from 'vitest'
import {
  buildPosStoreDisplayNameLookup,
  resolvePosStoreDisplayName,
  stripCmPrefixFromNumericStoreLabel,
} from '@/lib/pos-store-display-name'

describe('stripCmPrefixFromNumericStoreLabel', () => {
  it('strips CM only for numeric store codes', () => {
    expect(stripCmPrefixFromNumericStoreLabel('CM 1001')).toBe('1001')
    expect(stripCmPrefixFromNumericStoreLabel('1001')).toBe('1001')
    expect(stripCmPrefixFromNumericStoreLabel('CM Ekkamai')).toBe('CM Ekkamai')
  })
})

describe('resolvePosStoreDisplayName', () => {
  it('does not show CM on numeric Omni store codes', () => {
    const lookup = buildPosStoreDisplayNameLookup([
      { code: '1001', name: 'CM 1001', gps_name: 'CM 1001' },
    ])
    expect(resolvePosStoreDisplayName('1001', lookup)).toBe('1001')
    expect(resolvePosStoreDisplayName('CM 1001', lookup)).toBe('1001')
  })

  it('keeps Choongman named store labels', () => {
    const lookup = buildPosStoreDisplayNameLookup([
      { code: 'CM Ekkamai', gps_name: 'CM Ekkamai' },
    ])
    expect(resolvePosStoreDisplayName('CM Ekkamai', lookup)).toBe('CM Ekkamai')
  })
})
