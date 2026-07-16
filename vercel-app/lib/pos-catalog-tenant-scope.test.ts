import { describe, expect, it } from 'vitest'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  posMenuCategoriesSettingsKey,
  rowBelongsToPosCatalogTenant,
  stampPosCatalogTenantId,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

describe('pos-catalog-tenant-scope', () => {
  const enforced: PosCatalogTenantScope = { enforce: true, tenantId: 'acme-bbq' }
  const legacy: PosCatalogTenantScope = { enforce: false, tenantId: '' }
  const orphan: PosCatalogTenantScope = { enforce: true, tenantId: '' }

  it('appends tenant filter only when enforced with tenantId', () => {
    expect(appendPosCatalogTenantFilter('is_active=eq.true', enforced)).toBe(
      'is_active=eq.true&tenant_id=eq.acme-bbq'
    )
    expect(appendPosCatalogTenantFilter('', enforced)).toBe('tenant_id=eq.acme-bbq')
    expect(appendPosCatalogTenantFilter('is_active=eq.true', legacy)).toBe('is_active=eq.true')
    expect(appendPosCatalogTenantFilter('', orphan)).toBe('')
  })

  it('stamps tenant_id on rows when enforced', () => {
    expect(stampPosCatalogTenantId({ code: 'c01' }, enforced)).toEqual({
      code: 'c01',
      tenant_id: 'acme-bbq',
    })
    expect(stampPosCatalogTenantId({ code: 'c01', tenant_id: 'other' }, enforced)).toEqual({
      code: 'c01',
      tenant_id: 'other',
    })
    expect(stampPosCatalogTenantId({ code: 'c01' }, legacy)).toEqual({ code: 'c01' })
  })

  it('blocks writes without tenant on Omni', () => {
    expect(assertPosCatalogTenantWritable(enforced)).toBeNull()
    expect(assertPosCatalogTenantWritable(legacy)).toBeNull()
    expect(assertPosCatalogTenantWritable(orphan)).toMatch(/테넌트/)
  })

  it('checks row ownership', () => {
    expect(rowBelongsToPosCatalogTenant({ tenant_id: 'acme-bbq' }, enforced)).toBe(true)
    expect(rowBelongsToPosCatalogTenant({ tenant_id: 'other' }, enforced)).toBe(false)
    expect(rowBelongsToPosCatalogTenant({ tenant_id: null }, legacy)).toBe(true)
    expect(rowBelongsToPosCatalogTenant({ tenant_id: 'x' }, orphan)).toBe(false)
  })

  it('namespaces category settings key per tenant', () => {
    expect(posMenuCategoriesSettingsKey(enforced)).toBe('pos_menu_categories:acme-bbq')
    expect(posMenuCategoriesSettingsKey(legacy)).toBe('pos_menu_categories')
  })

  it('blocks Omni queries without tenantId', async () => {
    const { isPosCatalogTenantQueryBlocked } = await import('@/lib/pos-catalog-tenant-scope')
    expect(isPosCatalogTenantQueryBlocked(enforced)).toBe(false)
    expect(isPosCatalogTenantQueryBlocked(legacy)).toBe(false)
    expect(isPosCatalogTenantQueryBlocked(orphan)).toBe(true)
  })
})
