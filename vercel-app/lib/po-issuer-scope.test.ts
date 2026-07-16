import { describe, expect, it } from 'vitest'
import {
  canAccessAccountingPoForAuth,
  resolvePoIssuerStoreFromAuth,
} from '@/lib/po-issuer-scope'
import { receivableRowVisibleToStoreManager } from '@/lib/receivable-ledger-pure'

describe('resolvePoIssuerStoreFromAuth', () => {
  it('returns store for manager at franchise branch', () => {
    expect(resolvePoIssuerStoreFromAuth({ role: 'manager', store: 'CM Silom' })).toBe('CM Silom')
  })

  it('returns null for office at HQ', () => {
    expect(resolvePoIssuerStoreFromAuth({ role: 'officer', store: 'Office' })).toBeNull()
  })
})

describe('canAccessAccountingPoForAuth', () => {
  it('allows store issuer to see own issued PO', () => {
    expect(
      canAccessAccountingPoForAuth({
        role: 'manager',
        store: 'CM Silom',
        issuerStore: 'CM Silom',
        relatedStore: 'CM The Street',
      })
    ).toBe(true)
  })

  it('allows franchisee to see HQ bill to their store', () => {
    expect(
      canAccessAccountingPoForAuth({
        role: 'manager',
        store: 'CM Silom',
        relatedStore: 'CM Silom',
      })
    ).toBe(true)
  })
})

describe('receivableRowVisibleToStoreManager', () => {
  it('includes HQ bill to own store', () => {
    expect(
      receivableRowVisibleToStoreManager({ store_name: 'CM Silom', amount: 100 }, 'CM Silom')
    ).toBe(true)
  })

  it('includes store-issued receivable from other store', () => {
    expect(
      receivableRowVisibleToStoreManager(
        { store_name: 'CM The Street', creditor_store: 'CM Silom', amount: 200 },
        'CM Silom'
      )
    ).toBe(true)
  })
})
