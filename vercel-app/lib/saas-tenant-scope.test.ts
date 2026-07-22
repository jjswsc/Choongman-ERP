import { describe, expect, it } from 'vitest'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  authTenantMatchesStoreTenant,
  isSaasTenantQueryBlocked,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

describe('saas-tenant-scope', () => {
  const enforced: SaasTenantScope = { enforce: true, tenantId: 'acme' }
  const orphan: SaasTenantScope = { enforce: true, tenantId: '' }
  const legacy: SaasTenantScope = { enforce: false, tenantId: '' }

  it('appends and stamps', () => {
    expect(appendSaasTenantFilter('a=eq.1', enforced)).toBe('a=eq.1&tenant_id=eq.acme')
    expect(stampSaasTenantId({ x: 1 }, enforced)).toEqual({ x: 1, tenant_id: 'acme' })
  })

  it('blocks orphan Omni queries', () => {
    expect(isSaasTenantQueryBlocked(orphan)).toBe(true)
    expect(assertSaasTenantWritable(orphan)).toMatch(/테넌트/)
    expect(isSaasTenantQueryBlocked(legacy)).toBe(false)
  })

  it('detects cross-tenant store mismatch only when both sides known', () => {
    expect(authTenantMatchesStoreTenant('acme', 'acme')).toBe(true)
    expect(authTenantMatchesStoreTenant('acme', 'other')).toBe(false)
    expect(authTenantMatchesStoreTenant('acme', '')).toBe(true)
    expect(authTenantMatchesStoreTenant('', 'other')).toBe(true)
  })
})
