import { describe, expect, it } from 'vitest'
import {
  buildReceivableAccrualStoreIndex,
  buildReceivableListWithCumulative,
  resolveReceivableAttributedStore,
  type ReceivableTransactionRow,
} from './receivable-ledger-scope'
import { receivableStoreGroupKey } from './receivable-store-key'

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

describe('buildReceivableListWithCumulative', () => {
  it('includes cumulative-only stores outside the search period', () => {
    const vendorMaps = { storeToVendor: new Map(), vendorCodeToStores: new Map() }
    const priorRow: ReceivableTransactionRow = {
      store_name: 'Sun Food',
      amount: -170666,
      ref_type: 'Order',
      trans_date: '2026-01-15',
    }
    const attributionMaps = buildReceivableAccrualStoreIndex([priorRow])
    const cumulativeByStoreGroup = { [receivableStoreGroupKey('Sun Food')]: -170666 }
    const list = buildReceivableListWithCumulative({
      periodRows: [],
      scopedRows: [priorRow],
      vendorMaps,
      attributionMaps,
      cumulativeByStoreGroup,
    })
    expect(list).toHaveLength(1)
    expect(list[0].storeName).toBe('Sun Food')
    expect(list[0].balance).toBe(0)
    expect(list[0].cumulativeBalance).toBe(-170666)
    expect(list[0].items).toHaveLength(0)
  })
})
