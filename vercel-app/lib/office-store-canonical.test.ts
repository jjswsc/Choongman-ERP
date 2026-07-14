import { describe, expect, it } from 'vitest'
import {
  CANONICAL_OFFICE_STORE,
  canonicalOfficeStore,
  dedupeOfficeStoreOptions,
  inboundPersistLocation,
  isOfficeStoreVariant,
  officeInboundLocationInFilterSuffix,
  postgrestQuotedInList,
} from '@/lib/office-store-canonical'

describe('office-store-canonical', () => {
  it('flags HQ, CM Office, and 입고등록 as office variants', () => {
    expect(isOfficeStoreVariant('HQ')).toBe(true)
    expect(isOfficeStoreVariant('CM Office')).toBe(true)
    expect(isOfficeStoreVariant('Office')).toBe(true)
    expect(isOfficeStoreVariant('입고등록')).toBe(true)
    expect(isOfficeStoreVariant('입고등록(본사)')).toBe(true)
    expect(isOfficeStoreVariant('CM Bangna')).toBe(false)
  })

  it('canonicalizes office variants to CM Office', () => {
    expect(canonicalOfficeStore('HQ')).toBe(CANONICAL_OFFICE_STORE)
    expect(canonicalOfficeStore('Office')).toBe(CANONICAL_OFFICE_STORE)
    expect(canonicalOfficeStore('입고등록')).toBe(CANONICAL_OFFICE_STORE)
    expect(canonicalOfficeStore('CM Bangna')).toBe('CM Bangna')
  })

  it('persists inbound location as 입고등록 for office selections', () => {
    expect(inboundPersistLocation('CM Office')).toBe('입고등록')
    expect(inboundPersistLocation('입고등록')).toBe('입고등록')
    expect(inboundPersistLocation('')).toBe('입고등록')
    expect(inboundPersistLocation('CM Bangna')).toBe('CM Bangna')
  })

  it('quotes office locations for PostgREST in.()', () => {
    expect(postgrestQuotedInList(['입고등록', 'CM Office'])).toBe('"입고등록","CM Office"')
    expect(officeInboundLocationInFilterSuffix()).toContain('"CM Office"')
    expect(officeInboundLocationInFilterSuffix()).toContain('"입고등록"')
  })

  it('dedupes office store options including 입고등록', () => {
    expect(dedupeOfficeStoreOptions(['HQ', 'CM Office', 'CM Asoke', 'Office', '입고등록'])).toEqual([
      'CM Asoke',
      CANONICAL_OFFICE_STORE,
    ])
  })
})
