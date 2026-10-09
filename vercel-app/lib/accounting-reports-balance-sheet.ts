import {
  sumBankTransactionsForAccounts,
  sumPayablesBalance,
  sumReceivablesBalance,
} from '@/lib/accounting-balance-summaries'
import { sumBorrowingsBalance } from '@/lib/borrowing-ledger'
import { getGlBalancesAsOf, glBalanceForCode } from '@/lib/gl-balance-as-of'
import { mapWithConcurrency } from '@/lib/map-with-concurrency'
import { resolveAccountingRollupStores } from '@/lib/accounting-store-scope'
import { mergeBalanceSheetReports } from '@/lib/accounting-income-statement-merge'
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'
import { buildStoreFieldOrIlikeFragment } from '@/lib/accounting-store-match'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  computeIncomeStatementReportShared,
  getMonthsFromYearStart,
  MONTHLY_INCOME_REPORT_CONCURRENCY,
} from '@/lib/accounting-reports-income'
import { getInventoryValue, loadItemValuationUnitCostMap } from '@/lib/accounting-reports-inventory'
import {
  type BalanceSheetReport,
  type IncomeScopeInput,
  isHqAccountingStoreRow,
  normalizeIncomeScope,
  type UnpostedBankTransaction,
} from '@/lib/accounting-reports-shared'

const UNPOSTED_WITHDRAW_CATEGORIES = ['transfer', 'loan', 'advance', 'correction'] as const

export async function computeBalanceSheetReport(input: IncomeScopeInput): Promise<BalanceSheetReport> {
  const scope = normalizeIncomeScope(input)
  const rollupStores = resolveAccountingRollupStores(scope)
  if (rollupStores && rollupStores.length > 1) {
    const perStore = await Promise.all(
      rollupStores.map((store) =>
        computeBalanceSheetReport({
          ...input,
          storeFilter: store,
        })
      )
    )
    return mergeBalanceSheetReports(perStore, {
      yearMonth: scope.yearMonth,
      startStr: scope.startStr,
      endStr: scope.endStr,
    })
  }
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope

  let bankAccounts: { id?: number; store?: string; opening_balance?: number }[] = []
  try {
    if (isHQ) {
      bankAccounts = ((await supabaseSelect('bank_accounts', { select: 'id,store,opening_balance', limit: 2000 })) as
        | { id?: number; store?: string; opening_balance?: number }[]
        | null)?.filter((x) => isHqAccountingStoreRow(String(x.store || ''))) || []
    } else if (storeFilter !== 'All') {
      const storeFrag = buildStoreFieldOrIlikeFragment('store', storeFilter)
      // 빈 필터면 전 계좌 조회가 되어 잔액이 부풀 수 있음 → 매장 미매칭 시 빈 목록
      bankAccounts = storeFrag
        ? ((await supabaseSelectFilter('bank_accounts', storeFrag, {
            select: 'id,store,opening_balance',
            limit: 2000,
          })) as { id?: number; store?: string; opening_balance?: number }[] | null) || []
        : []
    } else {
      bankAccounts = ((await supabaseSelect('bank_accounts', { select: 'id,store,opening_balance', limit: 2000 })) as
        | { id?: number; store?: string; opening_balance?: number }[]
        | null) || []
    }
  } catch {
    bankAccounts = []
  }
  const accountIds = bankAccounts.map((a) => a.id).filter((id): id is number => id != null)
  const openingCash = bankAccounts.reduce((sum, a) => sum + (Number(a.opening_balance) || 0), 0)

  let bankDelta = 0
  if (accountIds.length > 0) {
    const bankSum = await sumBankTransactionsForAccounts(accountIds, endStr)
    bankDelta = bankSum.total
  }
  const cashAndBanks = openingCash + bankDelta

  const itemUnitCostMap = await loadItemValuationUnitCostMap()
  const inventory = isHQ
    ? await getInventoryValue('본사', endStr, false, itemUnitCostMap, false)
    : storeFilter !== 'All'
      ? await getInventoryValue(storeFilter, endStr, false, itemUnitCostMap, false)
      : await getInventoryValue(null, endStr, false, itemUnitCostMap, true)

  let subledgerReceivables = 0
  let subledgerPayables = 0
  let subledgerBorrowings = 0
  try {
    const recv = await sumReceivablesBalance({ endStr, storeFilter, isHQ })
    subledgerReceivables = recv.total
  } catch {
    subledgerReceivables = 0
  }
  try {
    const pay = await sumPayablesBalance({ endStr, storeFilter, isHQ })
    subledgerPayables = pay.total
  } catch {
    subledgerPayables = 0
  }
  try {
    const borrow = await sumBorrowingsBalance({ endStr, storeFilter, isHQ })
    subledgerBorrowings = borrow.total
  } catch {
    subledgerBorrowings = 0
  }

  let receivables = subledgerReceivables
  let payables = subledgerPayables
  let borrowings = subledgerBorrowings
  let loansReceivable = 0
  let glSource: 'rpc' | 'select' = 'select'
  let glAccount1130 = 0
  let glAccount2110 = 0
  let glAccount2150 = 0
  let glAccount1150 = 0
  let glAccount1010 = 0
  try {
    const gl = await getGlBalancesAsOf({
      endStr,
      storeFilter,
      accountCodes: ['1010', '1130', '2110', '2150', '1150'],
    })
    glSource = gl.source
    glAccount1130 = glBalanceForCode(gl.rows, '1130')
    glAccount2110 = glBalanceForCode(gl.rows, '2110')
    glAccount2150 = glBalanceForCode(gl.rows, '2150')
    glAccount1150 = glBalanceForCode(gl.rows, '1150')
    glAccount1010 = glBalanceForCode(gl.rows, '1010')
    receivables = glAccount1130
    payables = glAccount2110
    borrowings = glAccount2150
    loansReceivable = glAccount1150
  } catch {
    /* RPC·select 폴백 실패 시 보조원장 유지 */
  }

  const incomeForMonth = (ym: string) =>
    computeIncomeStatementReportShared({
      yearMonth: ym,
      storeFilter,
      userStore: input.userStore,
      userRole: input.userRole,
      includeDebug: false,
    })

  const months = getMonthsFromYearStart(yearMonth)
  const ytdNetProfits = await mapWithConcurrency(months, MONTHLY_INCOME_REPORT_CONCURRENCY, async (ym) =>
    (await incomeForMonth(ym)).netProfit
  )
  const retainedEarningsYtd = ytdNetProfits.reduce((sum, n) => sum + n, 0)
  const currentIncome = await incomeForMonth(yearMonth)

  const openingCapital = 0
  const equityTotal = openingCapital + retainedEarningsYtd
  const assetsTotal = cashAndBanks + inventory + receivables + loansReceivable
  const liabilitiesTotal = payables + borrowings
  const balanceCheckDiff = assetsTotal - (liabilitiesTotal + equityTotal)

  let unpostedBankWithdrawals: UnpostedBankTransaction[] = []
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    const catOr = UNPOSTED_WITHDRAW_CATEGORIES.map((c) => `category.eq.${c}`).join(',')
    const filter = `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&or=(${catOr})`
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      select: 'id,trans_date,amount,category,memo,store,note',
      order: 'trans_date.asc',
      limit: 2000,
    })) as {
      id?: number
      trans_date?: string
      amount?: number
      category?: string
      memo?: string | null
      store?: string | null
      note?: string | null
    }[]
    unpostedBankWithdrawals = (rows || [])
      .filter((r) => !isExpenseInternalBankNote(r.note))
      .map((r) => ({
      id: Number(r.id || 0),
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      category: String(r.category || ''),
      memo: r.memo != null ? String(r.memo) : null,
      store: r.store != null ? String(r.store) : null,
    }))
  }

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    assets: {
      cashAndBanks,
      inventory,
      receivables,
      loansReceivable,
      total: assetsTotal,
    },
    liabilities: {
      payables,
      borrowings,
      total: liabilitiesTotal,
    },
    equity: {
      openingCapital,
      retainedEarningsYtd,
      currentPeriodProfit: currentIncome.netProfit,
      total: equityTotal,
    },
    balanceCheckDiff,
    unpostedBankWithdrawals,
    ledgerBreakdown: {
      glAccount1130,
      subledgerReceivables,
      glAccount2110,
      subledgerPayables,
      glAccount2150,
      subledgerBorrowings,
      glAccount1150,
      glAccount1010,
      glSource,
    },
  }
}
