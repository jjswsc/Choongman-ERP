import { describe, expect, it } from 'vitest'
import {
  applyBankAccountMetaToReceivableGroups,
  buildBankTransactionDeepLink,
  canManuallyToggleReceivableReceiveCheck,
  collectBankTransactionIdsFromReceivableGroups,
  isConsolidatedBankReceiveRow,
  filterUnallocatedBankDepositsVisible,
  listUnallocatedBankReceives,
  sliceUnallocatedBankDepositsForPreview,
  sumUnallocatedBankDeposits,
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

describe('bank account meta on receivable groups', () => {
  it('collects ids from deposits and linked rows', () => {
    expect(
      collectBankTransactionIdsFromReceivableGroups([
        {
          unallocatedBankDeposits: [{ bankTransactionId: 4106, transDate: '2026-04-24', amountAbs: 100 }],
          items: [{ bank_transaction_id: 3078 }, { bank_transaction_id: 4106 }],
        },
      ])
    ).toEqual(expect.arrayContaining([4106, 3078]))
  })

  it('attaches the deposit account so deep links do not reuse another store account', () => {
    const [item] = applyBankAccountMetaToReceivableGroups(
      [
        {
          unallocatedBankDeposits: [{ bankTransactionId: 11039, transDate: '2026-08-09', amountAbs: 11905.17 }],
          items: [{ bank_transaction_id: 11039 }],
        },
      ],
      { 11039: { accountId: 12, accountName: 'HQ KBank', accountStore: 'CM Office' } }
    )
    expect(item?.unallocatedBankDeposits?.[0]?.bankAccountId).toBe(12)
    expect(item?.unallocatedBankDeposits?.[0]?.bankAccountName).toBe('HQ KBank')
    expect(item?.items?.[0]?.bank_account_id).toBe(12)
  })
})

describe('filterUnallocatedBankDepositsVisible', () => {
  const deposits = [
    { transDate: '2026-06-18', amountAbs: 28454.19 },
    { transDate: '2026-06-30', amountAbs: 100 },
    { transDate: '2026-07-01', amountAbs: 200 },
    { transDate: '2026-09-11', amountAbs: 10921.49 },
  ]

  it('hides deposits before 2026-07-01', () => {
    const visible = filterUnallocatedBankDepositsVisible(deposits)
    expect(visible.map((d) => d.transDate)).toEqual(['2026-07-01', '2026-09-11'])
    expect(sumUnallocatedBankDeposits(visible)).toBe(11121.49)
  })

  it('keeps an empty list empty', () => {
    expect(filterUnallocatedBankDepositsVisible([])).toEqual([])
  })
})

describe('sliceUnallocatedBankDepositsForPreview', () => {
  it('returns all when at or below the limit', () => {
    expect(sliceUnallocatedBankDepositsForPreview([1, 2, 3], false, 8)).toEqual({
      visible: [1, 2, 3],
      hiddenCount: 0,
      canToggle: false,
    })
  })

  it('keeps the newest slice when collapsed over the limit', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(sliceUnallocatedBankDepositsForPreview(list, false, 8)).toEqual({
      visible: [1, 2, 3, 4, 5, 6, 7, 8],
      hiddenCount: 1,
      canToggle: true,
    })
  })

  it('returns all when expanded', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(sliceUnallocatedBankDepositsForPreview(list, true, 8)).toEqual({
      visible: list,
      hiddenCount: 0,
      canToggle: true,
    })
  })
})

describe('buildBankTransactionDeepLink', () => {
  it('includes accountId so bank query opens the deposit account', () => {
    expect(
      buildBankTransactionDeepLink({
        bankTransactionId: 11039,
        transDate: '2026-08-09',
        accountId: 12,
      })
    ).toBe(
      '/admin/bank-transactions?tab=query&openRegisterTxId=11039&startStr=2026-08-09&endStr=2026-08-09&accountId=12'
    )
  })

  it('omits accountId when unknown', () => {
    expect(buildBankTransactionDeepLink({ bankTransactionId: 7 })).toBe(
      '/admin/bank-transactions?tab=query&openRegisterTxId=7'
    )
  })
})
