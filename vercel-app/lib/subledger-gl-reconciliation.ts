import { sumPayablesBalance, sumReceivablesBalance } from '@/lib/accounting-balance-summaries'
import { sumBorrowingsBalance } from '@/lib/borrowing-ledger'
import { getGlBalancesAsOf, glBalanceForCode } from '@/lib/gl-balance-as-of'
import { normalizeIncomeScope, type IncomeScopeInput } from '@/lib/accounting-reports'
import { resolveAccountingRollupStores } from '@/lib/accounting-store-scope'
import { findReceivableBankSubledgerGaps, type ReceivableBankSubledgerGap } from '@/lib/receivable-b2b-bank-link-gap'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { buildStoreFieldOrIlikeFragment } from '@/lib/accounting-store-match'
import { channelSettlementAllowsReceivableReceive } from '@/lib/pos-bank-chip-settlement'

export type SubledgerGlReconciliationReport = {
  yearMonth: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  receivables: {
    glAccount1130: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  payables: {
    glAccount2110: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  borrowings: {
    glAccount2150: number
    subledgerTotal: number
    difference: number
    glSource: 'rpc' | 'select'
    subledgerSource: 'rpc' | 'select'
  }
  cashGl1010: number
  /** NET 입금만 있고 채널 정산·분개가 없는 위험 입금 */
  riskyRevenueDeposits: {
    id: number
    transDate: string
    amount: number
    category: string
    store: string | null
    memo: string | null
    accountId?: number | null
  }[]
  /** 정산일·채널별 미분개 또는 통장 미연결 */
  pendingChannelSettlements: {
    id: number
    storeCode: string
    settleDate: string
    channel: string
    gross: number
    net: number
    fee: number
    bankTransactionId: number | null
    journalEntryId: number | null
  }[]
  /** receivable_receive인데 채널 정산과 충돌 가능 */
  receivableReceiveWithSettlementLink: {
    bankId: number
    transDate: string
    amount: number
    storeName: string | null
    accountId?: number | null
    settlementIds: number[]
  }[]
  /** B2B 수금으로 미수금 Receive가 있어야 하는데 없는 통장 입금 */
  receivableBankSubledgerGaps: ReceivableBankSubledgerGap[]
}

function mergeSubledgerGlReconciliationReports(
  reports: SubledgerGlReconciliationReport[]
): SubledgerGlReconciliationReport {
  if (reports.length === 0) {
    return {
      yearMonth: '',
      endStr: '',
      storeFilter: 'All',
      timezone: 'Asia/Bangkok',
      receivables: {
        glAccount1130: 0,
        subledgerTotal: 0,
        difference: 0,
        glSource: 'select',
        subledgerSource: 'select',
      },
      payables: {
        glAccount2110: 0,
        subledgerTotal: 0,
        difference: 0,
        glSource: 'select',
        subledgerSource: 'select',
      },
      borrowings: {
        glAccount2150: 0,
        subledgerTotal: 0,
        difference: 0,
        glSource: 'select',
        subledgerSource: 'select',
      },
      cashGl1010: 0,
      riskyRevenueDeposits: [],
      pendingChannelSettlements: [],
      receivableReceiveWithSettlementLink: [],
      receivableBankSubledgerGaps: [],
    }
  }
  if (reports.length === 1) return { ...reports[0]!, storeFilter: 'All' }
  const sum = (n: (r: SubledgerGlReconciliationReport) => number) =>
    round2(reports.reduce((a, r) => a + n(r), 0))
  const gl1130 = sum((r) => r.receivables.glAccount1130)
  const subRecv = sum((r) => r.receivables.subledgerTotal)
  const gl2110 = sum((r) => r.payables.glAccount2110)
  const subPay = sum((r) => r.payables.subledgerTotal)
  const gl2150 = sum((r) => r.borrowings.glAccount2150)
  const subBorrow = sum((r) => r.borrowings.subledgerTotal)
  return {
    yearMonth: reports[0]!.yearMonth,
    endStr: reports[0]!.endStr,
    storeFilter: 'All',
    timezone: 'Asia/Bangkok',
    receivables: {
      glAccount1130: gl1130,
      subledgerTotal: subRecv,
      difference: round2(gl1130 - subRecv),
      glSource: reports[0]!.receivables.glSource,
      subledgerSource: reports[0]!.receivables.subledgerSource,
    },
    payables: {
      glAccount2110: gl2110,
      subledgerTotal: subPay,
      difference: round2(gl2110 - subPay),
      glSource: reports[0]!.payables.glSource,
      subledgerSource: reports[0]!.payables.subledgerSource,
    },
    borrowings: {
      glAccount2150: gl2150,
      subledgerTotal: subBorrow,
      difference: round2(gl2150 - subBorrow),
      glSource: reports[0]!.borrowings.glSource,
      subledgerSource: reports[0]!.borrowings.subledgerSource,
    },
    cashGl1010: sum((r) => r.cashGl1010),
    riskyRevenueDeposits: reports.flatMap((r) => r.riskyRevenueDeposits),
    pendingChannelSettlements: reports.flatMap((r) => r.pendingChannelSettlements),
    receivableReceiveWithSettlementLink: reports.flatMap((r) => r.receivableReceiveWithSettlementLink),
    receivableBankSubledgerGaps: reports.flatMap((r) => r.receivableBankSubledgerGaps),
  }
}

export async function computeSubledgerGlReconciliation(
  input: IncomeScopeInput
): Promise<SubledgerGlReconciliationReport> {
  const scope = normalizeIncomeScope(input)
  const rollupStores = resolveAccountingRollupStores(scope)
  if (rollupStores && rollupStores.length > 1) {
    const perStore = await Promise.all(
      rollupStores.map((store) =>
        computeSubledgerGlReconciliation({
          ...input,
          storeFilter: store,
        })
      )
    )
    return mergeSubledgerGlReconciliationReports(perStore)
  }
  const { yearMonth, endStr, storeFilter, isHQ } = scope
  const yearStart = `${yearMonth.slice(0, 4)}-01-01`

  const [gl, recv, pay, borrow, receivableBankSubledgerGaps] = await Promise.all([
    getGlBalancesAsOf({ endStr, storeFilter, accountCodes: ['1010', '1130', '2110', '2150'] }),
    sumReceivablesBalance({ endStr, storeFilter, isHQ }),
    sumPayablesBalance({ endStr, storeFilter, isHQ }),
    sumBorrowingsBalance({ endStr, storeFilter, isHQ }),
    findReceivableBankSubledgerGaps({
      endStr,
      startStr: yearStart,
      storeFilter,
      limit: 2000,
    }),
  ])

  const gl1130 = glBalanceForCode(gl.rows, '1130')
  const gl2110 = glBalanceForCode(gl.rows, '2110')
  const gl2150 = glBalanceForCode(gl.rows, '2150')
  const gl1010 = glBalanceForCode(gl.rows, '1010')
  const subRecv = recv.total
  const subPay = pay.total
  const subBorrow = borrow.total

  const bankStoreFrag = storeFilter !== 'All' ? buildStoreFieldOrIlikeFragment('store', storeFilter) : ''

  let riskyFilter =
    `trans_date=lte.${encodeURIComponent(endStr)}&trans_type=eq.deposit&category=in.(revenue_delivery,revenue_card,revenue_qr,revenue_cash)`
  if (bankStoreFrag) riskyFilter += `&${bankStoreFrag}`

  const riskyRows = (await supabaseSelectFilter('bank_transactions', riskyFilter, {
    select: 'id,trans_date,amount,category,store,store_name,memo,account_id',
    order: 'trans_date.desc',
    limit: 200,
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    category?: string
    store?: string | null
    store_name?: string | null
    memo?: string | null
    account_id?: number | null
  }[]

  let settleFilter = `settle_date=lte.${encodeURIComponent(endStr)}`
  if (storeFilter !== 'All') {
    settleFilter += `&store_code=eq.${encodeURIComponent(storeFilter)}`
  }
  const settleRows = (await supabaseSelectFilter('pos_channel_settlements', settleFilter, {
    select: 'id,store_code,settle_date,channel,gross_amt,net_amt,fee_amt,bank_transaction_id,journal_entry_id',
    order: 'settle_date.desc',
    limit: 500,
  })) as {
    id?: number
    store_code?: string
    settle_date?: string
    channel?: string
    gross_amt?: number
    net_amt?: number
    fee_amt?: number
    bank_transaction_id?: number | null
    journal_entry_id?: number | null
  }[]

  const pendingChannelSettlements = (settleRows || [])
    .filter((r) => !r.journal_entry_id || !r.bank_transaction_id)
    .map((r) => ({
      id: Number(r.id || 0),
      storeCode: String(r.store_code || ''),
      settleDate: String(r.settle_date || '').slice(0, 10),
      channel: String(r.channel || ''),
      gross: Number(r.gross_amt) || 0,
      net: Number(r.net_amt) || 0,
      fee: Number(r.fee_amt) || 0,
      bankTransactionId: r.bank_transaction_id != null ? Number(r.bank_transaction_id) : null,
      journalEntryId: r.journal_entry_id != null ? Number(r.journal_entry_id) : null,
    }))

  let recvBankFilter = `trans_date=lte.${encodeURIComponent(endStr)}&trans_type=eq.deposit&category=eq.receivable_receive`
  if (bankStoreFrag) recvBankFilter += `&${bankStoreFrag}`
  const recvBankRows = (await supabaseSelectFilter('bank_transactions', recvBankFilter, {
    select: 'id,trans_date,amount,store_name,store,account_id,memo,note',
    limit: 300,
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    store_name?: string | null
    store?: string | null
    account_id?: number | null
    memo?: string | null
    note?: string | null
  }[]

  const receivableReceiveWithSettlementLink: SubledgerGlReconciliationReport['receivableReceiveWithSettlementLink'] =
    []
  for (const b of recvBankRows || []) {
    const bankId = Number(b.id || 0)
    if (bankId <= 0) continue
    if (channelSettlementAllowsReceivableReceive({ memo: b.memo, note: b.note })) continue
    const linked = (await supabaseSelectFilter(
      'pos_channel_settlements',
      `bank_transaction_id=eq.${bankId}`,
      { select: 'id', limit: 10 }
    )) as { id?: number }[] | null
    if (linked?.length) {
      receivableReceiveWithSettlementLink.push({
        bankId,
        transDate: String(b.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(b.amount) || 0),
        storeName: b.store_name != null ? String(b.store_name) : b.store != null ? String(b.store) : null,
        accountId: b.account_id != null ? Number(b.account_id) : null,
        settlementIds: (linked || []).map((x) => Number(x.id || 0)).filter((id) => id > 0),
      })
    }
  }

  return {
    yearMonth,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    receivables: {
      glAccount1130: gl1130,
      subledgerTotal: subRecv,
      difference: round2(gl1130 - subRecv),
      glSource: gl.source,
      subledgerSource: recv.source,
    },
    payables: {
      glAccount2110: gl2110,
      subledgerTotal: subPay,
      difference: round2(gl2110 - subPay),
      glSource: gl.source,
      subledgerSource: pay.source,
    },
    borrowings: {
      glAccount2150: gl2150,
      subledgerTotal: subBorrow,
      difference: round2(gl2150 - subBorrow),
      glSource: gl.source,
      subledgerSource: borrow.source,
    },
    cashGl1010: gl1010,
    riskyRevenueDeposits: (riskyRows || []).map((r) => ({
      id: Number(r.id || 0),
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      category: String(r.category || ''),
      store: r.store_name != null ? String(r.store_name) : r.store != null ? String(r.store) : null,
      memo: r.memo != null ? String(r.memo) : null,
      accountId: r.account_id != null ? Number(r.account_id) : null,
    })),
    pendingChannelSettlements,
    receivableReceiveWithSettlementLink,
    receivableBankSubledgerGaps,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
