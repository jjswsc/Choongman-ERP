import { describe, expect, it } from 'vitest'
import {
  buildReceivableAccrualStoreIndex,
  buildReceivableListWithCumulative,
  resolveReceivableAttributedStore,
  type ReceivableTransactionRow,
} from './receivable-ledger-scope'
import { receivableStoreGroupKey } from './receivable-store-key'

describe('resolveReceivableAttributedStore', () => {
  it('keeps Receive row on its own store_name — no date/amount guess to Order store', () => {
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
    expect(resolveReceivableAttributedStore(receive, maps)).toBe('CM Office')
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

  it('keeps cumulative balance stable when only startStr changes', () => {
    const vendorMaps = { storeToVendor: new Map(), vendorCodeToStores: new Map() }
    const scopedRows: ReceivableTransactionRow[] = [
      { store_name: 'CM Bangna', amount: 100000, ref_type: 'Order', trans_date: '2026-01-15' },
      { store_name: 'CM Bangna', amount: -40000, ref_type: 'Receive', trans_date: '2026-02-01' },
      { store_name: 'CM Bangna', amount: 50000, ref_type: 'Order', trans_date: '2026-04-01' },
      { store_name: 'CM Bangna', amount: -20000, ref_type: 'Receive', trans_date: '2026-05-01' },
    ]
    const attributionMaps = buildReceivableAccrualStoreIndex(scopedRows)
    const groupKey = receivableStoreGroupKey('CM Bangna')
    const cumulativeByStoreGroup = { [groupKey]: 90000 }

    for (const startStr of ['2025-12-01', '2026-03-01', '2026-06-01']) {
      const periodRows = scopedRows.filter((r) => String(r.trans_date || '').slice(0, 10) >= startStr)
      const list = buildReceivableListWithCumulative({
        periodRows,
        scopedRows,
        vendorMaps,
        attributionMaps,
        cumulativeByStoreGroup,
      })
      expect(list[0].cumulativeBalance).toBe(90000)
      if (startStr === '2026-03-01') {
        expect(list[0].balance).toBe(30000)
        expect(list[0].balance).not.toBe(list[0].cumulativeBalance)
      }
    }
  })
})
