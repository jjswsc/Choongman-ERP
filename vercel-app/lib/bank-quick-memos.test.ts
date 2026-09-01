import { describe, expect, it } from 'vitest'
import { BANK_QUICK_MEMO_DEFAULTS, mergeBankQuickMemoDefaults } from './bank-quick-memos'

describe('bank-quick-memos', () => {
  it('adds card/QR/Lineman defaults without dropping custom phrases', () => {
    expect(
      mergeBankQuickMemoDefaults(['Grab Sales', 'Sale Old Oil', 'Ingredients Makro'])
    ).toEqual([
      'Grab Sales',
      'Sale Old Oil',
      'Ingredients Makro',
      'Shopee Sales',
      'Line man sales',
      'Credit Card Sales',
      'store sales QR',
      'Cash Deposit',
    ])
  })

  it('keeps a complete custom list that already has the new defaults', () => {
    const saved = [...BANK_QUICK_MEMO_DEFAULTS, 'Sale Old Oil']
    expect(mergeBankQuickMemoDefaults(saved)).toEqual(saved)
  })
})
