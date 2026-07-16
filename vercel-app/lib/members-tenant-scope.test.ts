import { describe, expect, it } from 'vitest'
import {
  appendMembersTenantFilter,
  assertMembersTenantWritable,
  isMembersTenantQueryBlocked,
  stampMembersTenantId,
  type MembersTenantScope,
} from '@/lib/members-tenant-scope'

describe('members-tenant-scope', () => {
  const enforced: MembersTenantScope = { enforce: true, tenantId: 'acme-bbq' }
  const legacy: MembersTenantScope = { enforce: false, tenantId: '' }
  const orphan: MembersTenantScope = { enforce: true, tenantId: '' }

  it('appends tenant filter when enforced', () => {
    expect(appendMembersTenantFilter('status=eq.active', enforced)).toBe(
      'status=eq.active&tenant_id=eq.acme-bbq'
    )
    expect(appendMembersTenantFilter('', legacy)).toBe('')
    expect(appendMembersTenantFilter('status=eq.active', orphan)).toBe('status=eq.active')
  })

  it('stamps and blocks writes', () => {
    expect(stampMembersTenantId({ name: 'A' }, enforced)).toEqual({
      name: 'A',
      tenant_id: 'acme-bbq',
    })
    expect(assertMembersTenantWritable(enforced)).toBeNull()
    expect(assertMembersTenantWritable(orphan)).toMatch(/테넌트/)
  })

  it('blocks Omni queries without tenant', () => {
    expect(isMembersTenantQueryBlocked(enforced)).toBe(false)
    expect(isMembersTenantQueryBlocked(orphan)).toBe(true)
    expect(isMembersTenantQueryBlocked(legacy)).toBe(false)
  })
})
