import { describe, expect, it } from 'vitest'
import { buildSaasStorageObjectPath, sanitizeStoragePathSegment } from '@/lib/saas-storage-path'

describe('saas-storage-path', () => {
  it('prefixes tenant id when present', () => {
    expect(
      buildSaasStorageObjectPath({
        tenantId: 'Acme-Food',
        segments: ['notices', 'store1', 'a.jpg'],
      })
    ).toBe('acme-food/notices/store1/a.jpg')
  })

  it('omits tenant prefix when empty (충만)', () => {
    expect(
      buildSaasStorageObjectPath({
        tenantId: '',
        segments: ['proj', 'file.pdf'],
      })
    ).toBe('proj/file.pdf')
  })

  it('sanitizes unsafe segment chars', () => {
    expect(sanitizeStoragePathSegment('CM Silom / A')).toBe('CM_Silom_A')
  })
})
