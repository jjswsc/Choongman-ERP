import { describe, expect, it } from 'vitest'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isInventoryTenantQueryBlocked,
  stampInventoryTenantId,
  type InventoryTenantScope,
} from '@/lib/inventory-tenant-scope'

describe('inventory-tenant-scope', () => {
  const enforced: InventoryTenantScope = { enforce: true, tenantId: 'acme-bbq' }
  const legacy: InventoryTenantScope = { enforce: false, tenantId: '' }
  const orphan: InventoryTenantScope = { enforce: true, tenantId: '' }

  it('filters and stamps', () => {
    expect(appendInventoryTenantFilter('code=eq.a', enforced)).toBe('code=eq.a&tenant_id=eq.acme-bbq')
    expect(stampInventoryTenantId({ code: 'a' }, enforced)).toEqual({ code: 'a', tenant_id: 'acme-bbq' })
    expect(appendInventoryTenantFilter('', legacy)).toBe('')
  })

  it('blocks Omni without tenant', () => {
    expect(isInventoryTenantQueryBlocked(orphan)).toBe(true)
    expect(assertInventoryTenantWritable(orphan)).toMatch(/테넌트/)
    expect(assertInventoryTenantWritable(enforced)).toBeNull()
  })
})
