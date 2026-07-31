import { describe, expect, it } from 'vitest'
import { enrichPosOrderRowForSaaS } from '@/lib/pos-saas-schema-compat'

describe('enrichPosOrderRowForSaaS', () => {
  it('sets tenant_id when provided (Omni Realtime filter)', () => {
    const row = enrichPosOrderRowForSaaS(
      { store_code: 'OMNI01', total: 100 },
      { tenantId: 'tenant-abc' }
    )
    expect(row.tenant_id).toBe('tenant-abc')
    expect(row.store_name).toBe('OMNI01')
    expect(row.total_amount).toBe(100)
  })

  it('does not set tenant_id when blank (Choongman / unresolved)', () => {
    const row = enrichPosOrderRowForSaaS(
      { store_code: 'CM01', total: 50 },
      { tenantId: '' }
    )
    expect(row.tenant_id).toBeUndefined()
  })

  it('keeps existing tenant_id', () => {
    const row = enrichPosOrderRowForSaaS(
      { store_code: 'OMNI01', tenant_id: 'already', total: 10 },
      { tenantId: 'other' }
    )
    expect(row.tenant_id).toBe('already')
  })
})
