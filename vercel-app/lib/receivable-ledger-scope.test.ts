import { describe, expect, it } from 'vitest'
import {
  buildReceivableAccrualStoreIndex,
  resolveReceivableAttributedStore,
  type ReceivableTransactionRow,
} from './receivable-ledger-scope'

describe('resolveReceivableAttributedStore', () => {
  it('matches Receive row to same-day Order store by amount', () => {
    const rows: ReceivableTransactionRow[] = [
      {
        store_name: 'CM Bangna',
        amount: 62916,
        ref_type: 'Order',
        trans_date: '2026-06-04',
      },
    ]
    const maps = buildReceivableAccrualStoreIndex(rows)
    const receive: ReceivableTransactionRow = {
      store_name: 'CM Office',
      amount: -62916,
      ref_type: 'Receive',
      trans_date: '2026-06-04',
      bank_transaction_id: 1,
    }
    expect(resolveReceivableAttributedStore(receive, maps)).toBe('CM Bangna')
  })

  it('keeps direct store_name for Order rows', () => {
    const maps = buildReceivableAccrualStoreIndex([])
    const order: ReceivableTransactionRow = {
      store_name: 'CM Bangna',
      amount: 1000,
      ref_type: 'Order',
      trans_date: '2026-06-04',
    }
    expect(resolveReceivableAttributedStore(order, maps)).toBe('CM Bangna')
  })
})
