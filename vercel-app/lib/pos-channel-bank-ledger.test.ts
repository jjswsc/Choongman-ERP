import { describe, expect, it } from 'vitest'
import { filterBankAccountsForSalesStores } from '@/lib/pos-channel-bank-ledger'

describe('filterBankAccountsForSalesStores', () => {
  it('keeps only the selected store account', () => {
    const out = filterBankAccountsForSalesStores(
      [
        { id: 1, store: 'CM Ekkamai' },
        { id: 2, store: 'CM Union Mall' },
        { id: 3, store: '' },
      ],
      ['CM Ekkamai']
    )
    expect(out).toEqual([{ id: 1, store: 'CM Ekkamai' }])
  })

  it('matches CM prefix variants', () => {
    const out = filterBankAccountsForSalesStores([{ id: 9, store: 'Ekkamai' }], ['CM Ekkamai'])
    expect(out).toEqual([{ id: 9, store: 'Ekkamai' }])
  })
})
