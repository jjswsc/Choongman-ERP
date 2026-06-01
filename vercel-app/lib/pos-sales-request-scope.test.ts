import { describe, expect, it } from 'vitest'
import { resolvePosSalesStoresForAuth } from '@/lib/pos-sales-request-scope'

describe('resolvePosSalesStoresForAuth', () => {
  it('franchisee empty request → all allowed stores', () => {
    const auth = {
      role: 'franchisee',
      store: 'CM Rama9',
      allowedStores: ['CM Rama9', 'CM Ladprao'],
    }
    expect(resolvePosSalesStoresForAuth(auth, [])).toEqual(['CM Rama9', 'CM Ladprao'])
  })

  it('franchisee clamps unknown store', () => {
    const auth = {
      role: 'franchisee',
      store: 'CM Rama9',
      allowedStores: ['CM Rama9', 'CM Ladprao'],
    }
    expect(resolvePosSalesStoresForAuth(auth, ['CM Other'])).toEqual(['CM Rama9', 'CM Ladprao'])
    expect(resolvePosSalesStoresForAuth(auth, ['CM Ladprao'])).toEqual(['CM Ladprao'])
  })

  it('office empty request → empty (all company)', () => {
    expect(resolvePosSalesStoresForAuth({ role: 'officer', store: 'Office' }, [])).toEqual([])
  })
})
