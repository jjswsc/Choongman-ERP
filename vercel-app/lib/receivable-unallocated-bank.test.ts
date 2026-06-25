import { describe, expect, it } from 'vitest'
import {
  canManuallyToggleReceivableReceiveCheck,
  isConsolidatedBankReceiveRow,
  listUnallocatedBankReceives,
  sumUnallocatedBankReceiveByStoreGroup,
} from './receivable-unallocated-bank'
import type { ReceivableTransactionRow } from './receivable-ledger-pure'
import { buildReceivableAccrualStoreIndex } from './receivable-ledger-pure'

describe('isConsolidatedBankReceiveRow', () => {
  it('matches 통장 통합 수금', () => {
    expect(
      isConsolidatedBankReceiveRow({
        ref_type: 'Receive',
        ref_id: null,
        bank_transaction_id: 99,
        memo: '통장 수령: Transfer',
        amount: -1000,
      })
    ).toBe(true)
  })

  it('rejects 인보이스별 연결', () => {
    expect(
      isConsolidatedBankReceiveRow({
        ref_type: 'Receive',
        ref_id: 12,
        bank_transaction_id: 99,
        memo: '통장 수금 IV1',
        amount: -1000,
      })
    ).toBe(false)
  })
})

describe('unallocated bank receive totals', () => {
  const rows: ReceivableTransactionRow[] = [
    {
      store_name: 'CM Asoke',
      ref_type: 'Receive',
      ref_id: null,
      bank_transaction_id: 7595,
      trans_date: '2026-06-17',
      memo: '통장 수령: Transfer',
      amount: -62332.11,
    },
    {
      store_name: 'CM Asoke',
      ref_type: 'Receive',
      ref_id: 101,
      bank_transaction_id: 8000,
      trans_date: '2026-06-18',
      memo: '통장 수금 IV1',
      amount: -500,
    },
    {
      store_name: 'CM Asoke',
      ref_type: 'Order',
      ref_id: 101,
      amount: 500,
      trans_date: '2026-06-10',
    },
  ]
  const maps = buildReceivableAccrualStoreIndex(rows)

  it('sums only consolidated rows per store group', () => {
    const byGroup = sumUnallocatedBankReceiveByStoreGroup(rows, maps)
    expect(byGroup[Object.keys(byGroup)[0]!]).toBe(62332.11)
  })

  it('lists unallocated bank deposits', () => {
    const list = listUnallocatedBankReceives(rows, maps)
    expect(list).toHaveLength(1)
    expect(list[0]?.bankTransactionId).toBe(7595)
  })
})

describe('canManuallyToggleReceivableReceiveCheck', () => {
  it('blocks when bank linked', () => {
    expect(
      canManuallyToggleReceivableReceiveCheck({
        receiveChecked: true,
        linkedBankTransactionId: 1,
        unallocatedBankReceiveTotal: 0,
      })
    ).toEqual({ allowed: false, reason: 'bank_linked' })
  })

  it('blocks new manual check when unallocated bank receive exists', () => {
    expect(
      canManuallyToggleReceivableReceiveCheck({
        receiveChecked: false,
        linkedBankTransactionId: 0,
        unallocatedBankReceiveTotal: 1000,
      })
    ).toEqual({ allowed: false, reason: 'unallocated_bank' })
  })

  it('allows uncheck when not bank linked', () => {
    expect(
      canManuallyToggleReceivableReceiveCheck({
        receiveChecked: true,
        linkedBankTransactionId: 0,
        unallocatedBankReceiveTotal: 5000,
      })
    ).toEqual({ allowed: true })
  })
})
