import { describe, expect, it } from 'vitest'
import { BANK_QUICK_MEMO_DEFAULTS, mergeBankQuickMemoDefaults } from './bank-quick-memos'

describe('bank-quick-memos', () => {
  it('adds card/QR/Lineman defaults without dropping custom phrases', () => {
    expect(
      mergeBankQuickMemoDefaults(['Grab Sales', 'Ingredients Makro'])
    ).toEqual([
      'Grab Sales',
      'Ingredients Makro',
      'Shopee Sales',
      'Line man sales',
      'Credit Card Sales',
      'store sales QR',
      'Cash Deposit',
      'Sale Old Oil',
    ])
  })

  it('keeps a complete custom list that already has the new defaults', () => {
    const saved = [...BANK_QUICK_MEMO_DEFAULTS, 'Ingredients Makro']
    expect(mergeBankQuickMemoDefaults(saved)).toEqual(saved)
  })
})
