import { describe, expect, it } from 'vitest'
import {
  dedupeLoginStoreKeysByLabel,
  dedupeLoginUsersByDisplayLabel,
  preferLoginStoreKey,
} from '@/lib/store-list-keys'

describe('login store label dedupe', () => {
  it('prefers store_code over display-name key', () => {
    const labels = { '1001': '1001', abc_1001: '1001' }
    expect(preferLoginStoreKey('1001', 'abc_1001', labels)).toBe('abc_1001')
  })

  it('collapses users map duplicate labels', () => {
    const users: Record<string, string[]> = {
      '1001': ['manager'],
      abc_1001: ['manager', 'staff'],
    }
    const labels: Record<string, string> = {
      '1001': '1001',
      abc_1001: '1001',
    }
    const companies: Record<string, string> = {
      '1001': 'ABC Company',
      abc_1001: 'ABC Company',
    }
    dedupeLoginUsersByDisplayLabel(users, labels, companies)
    expect(Object.keys(users)).toEqual(['abc_1001'])
    expect(users.abc_1001).toEqual(['manager', 'staff'])
    expect(companies.abc_1001).toBe('ABC Company')
    expect(companies['1001']).toBeUndefined()
  })

  it('dedupes dropdown keys by label', () => {
    const labels = { '1001': '1001', abc_1001: '1001', other: 'Other' }
    expect(dedupeLoginStoreKeysByLabel(['1001', 'abc_1001', 'other'], labels)).toEqual([
      'abc_1001',
      'other',
    ])
  })
})
