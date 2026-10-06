import { describe, expect, it } from 'vitest'
import {
  authorizeInboundBatchMutation,
  canCorrectOwnStoreInbound,
  inboundLocationAllowedForActor,
} from '@/lib/inbound-store-access'

describe('inbound store correction access', () => {
  it('lets a branch manager correct only their own store', () => {
    const actor = { role: 'manager', store: 'CM Silom', allowedStores: ['CM Silom'] }
    expect(canCorrectOwnStoreInbound('manager', 'CM Silom')).toBe(true)
    expect(inboundLocationAllowedForActor(actor, 'CM Silom')).toBe(true)
    expect(inboundLocationAllowedForActor(actor, 'CM Ekkamai')).toBe(false)
  })

  it('lets a franchisee correct every allowed store', () => {
    const actor = {
      role: 'franchisee',
      store: 'CM Silom',
      allowedStores: ['CM Silom', 'CM Ekkamai'],
    }
    expect(inboundLocationAllowedForActor(actor, 'CM Ekkamai')).toBe(true)
    expect(inboundLocationAllowedForActor(actor, 'CM Tower')).toBe(false)
  })

  it('lets head office and accounting correct any store', () => {
    expect(inboundLocationAllowedForActor({ role: 'officer', store: 'CM Office' }, 'CM Silom')).toBe(true)
    expect(inboundLocationAllowedForActor({ role: 'accounting', store: 'CM Silom' }, 'CM Ekkamai')).toBe(true)
  })

  it('keeps an Omni branch manager on their own store', () => {
    const actor = { role: 'Manager', store: '1001' }
    expect(canCorrectOwnStoreInbound('Manager', '1001')).toBe(true)
    expect(inboundLocationAllowedForActor(actor, '1001')).toBe(true)
    expect(inboundLocationAllowedForActor(actor, '1002')).toBe(false)
  })

  it('denies staff and missing login', () => {
    expect(canCorrectOwnStoreInbound('staff', 'CM Silom')).toBe(false)
    expect(inboundLocationAllowedForActor({ role: 'staff', store: 'CM Silom' }, 'CM Silom')).toBe(false)
    expect(authorizeInboundBatchMutation(null, 'CM Silom').ok).toBe(false)
    const denied = authorizeInboundBatchMutation({ role: 'manager', store: 'CM Silom' }, 'CM Ekkamai')
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.status).toBe(403)
  })
})
