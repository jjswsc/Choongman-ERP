import { describe, expect, it } from 'vitest'
import {
  CANONICAL_OFFICE_STORE,
  canonicalOfficeStore,
  dedupeOfficeStoreOptions,
  isOfficeStoreVariant,
} from '@/lib/office-store-canonical'

describe('office-store-canonical', () => {
  it('flags HQ and CM Office as office variants', () => {
    expect(isOfficeStoreVariant('HQ')).toBe(true)
    expect(isOfficeStoreVariant('CM Office')).toBe(true)
    expect(isOfficeStoreVariant('Office')).toBe(true)
    expect(isOfficeStoreVariant('CM Bangna')).toBe(false)
  })

  it('canonicalizes office variants to CM Office', () => {
    expect(canonicalOfficeStore('HQ')).toBe(CANONICAL_OFFICE_STORE)
    expect(canonicalOfficeStore('Office')).toBe(CANONICAL_OFFICE_STORE)
    expect(canonicalOfficeStore('CM Bangna')).toBe('CM Bangna')
  })

  it('dedupes office store options', () => {
    expect(dedupeOfficeStoreOptions(['HQ', 'CM Office', 'CM Asoke', 'Office'])).toEqual([
      'CM Asoke',
      CANONICAL_OFFICE_STORE,
    ])
  })
})
