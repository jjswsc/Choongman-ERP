import { supabaseCountFilter, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokMonthRange } from '@/lib/bangkok-time'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
const BASE_LIMIT = 20000

export type IncomeScopeInput = {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  includeDebug?: boolean
}

export type IncomeStatementReport = {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  sales: number
  purchases: number
  beginningInventory: number
  endingInventory: number
  cogs: number
  expenses: number
  grossProfit: number
  netProfit: number
  expenseBreakdown: {
    pettyCash: number
    bankWithdraw: number
    fixedExpenses: number
    total: number
  }
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
  }
}

export type UnpostedBankTransaction = {
  id: number
  transDate: string
  amount: number
  category: string
  memo: string | null
  store: string | null
}

export type BalanceSheetReport = {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  timezone: 'Asia/Bangkok'
  assets: {
    cashAndBanks: number
    inventory: number
    receivables: number
    total: number
  }
  liabilities: {
    payables: number
    total: number
  }
  equity: {
    openingCapital: number
    retainedEarningsYtd: number
    currentPeriodProfit: number
    total: number
  }
  balanceCheckDiff: number
  /** 분개되지 않은 통장 출금 (transfer, loan, advance, correction) - balanceCheckDiff 원인 추적용 */
  unpostedBankWithdrawals: UnpostedBankTransaction[]
}

export function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return OFFICE_STORES.some((o) => x === o || x.toLowerCase().includes('office'))
}

export function normalizeIncomeScope(input: IncomeScopeInput): {
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
} {
  let storeFilter = String(input.storeFilter || '').trim()
  const userStore = String(input.userStore || '').trim()
  const userRole = String(input.userRole || '').toLowerCase()
  const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
  if (!isOffice && userStore) storeFilter = userStore
  if (!storeFilter) storeFilter = 'All'
  const { yearMonth, startStr, endStr } = getBangkokMonthRange(input.yearMonth)
  const isHQ = isOfficeStore(storeFilter)
  return { yearMonth, startStr, endStr, storeFilter, isHQ }
}

async function getDirectInboundPurchases(
  locationFilter: string | null,
  startStr: string,
  endStr: string,
  itemCostMap: Record<string, number>,
  excludeHqLocations = false
): Promise<number> {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let filter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (locationFilter) filter += `&location=ilike.${encodeURIComponent(locationFilter)}`

  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    select: 'item_code,qty,unit_cost,vendor_target,location',
    limit: BASE_LIMIT,
  })) as { item_code?: string; qty?: number; unit_cost?: number | null; vendor_target?: string; location?: string }[] | null

  let total = 0
  for (const r of rows || []) {
    if (String(r.vendor_target || '').trim() === 'From HQ') continue
    if (excludeHqLocations && (r.location === '입고등록' || isOfficeStore(String(r.location || '')))) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    const qty = Number(r.qty) || 0
    const unitCost = r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : (itemCostMap[code] ?? 0)
    total += qty * unitCost
  }
  return total
}

async function getFixedExpensesSum(
  storeFilter: string,
  yearMonthStr: string,
  isHQ: boolean
): Promise<number> {
  try {
    const all = (await supabaseSelect('fixed_expenses', { select: 'store,monthly_amount,start_year_month,end_year_month', limit: 2000 })) as
      | { store?: string; monthly_amount?: number; start_year_month?: string | null; end_year_month?: string | null }[]
      | null
    if (!all?.length) return 0
    let total = 0
    for (const r of all) {
      const start = r.start_year_month ? r.start_year_month : null
      const end = r.end_year_month ? r.end_year_month : null
      const active = (!start || yearMonthStr >= start) && (!end || yearMonthStr <= end)
      if (!active) continue
      const st = String(r.store || '').trim()
      if (isHQ) {
        if (!isOfficeStore(st) && !st.startsWith('Office-')) continue
      } else if (storeFilter !== 'All') {
        if (st.toLowerCase() !== storeFilter.toLowerCase()) continue
      }
      total += Number(r.monthly_amount) || 0
    }
    return total
  } catch {
    return 0
  }
}

async function getInventoryValue(
  locationFilter: string | null,
  cutoffDate: string,
  isBefore: boolean,
  itemCostMap: Record<string, number>,
  excludeHq = false
): Promise<number> {
  const op = isBefore ? 'lt' : 'lt'
  const boundary = isBefore ? cutoffDate : cutoffDate
  const cutoffUtcIso = isBefore
    ? getBangkokDateRangeUtc(boundary, boundary).dayStartUtcIso
    : getBangkokDateRangeUtc(boundary, boundary).nextDayStartUtcIso
  let filter = `log_date=${op}.${cutoffUtcIso}`
  if (locationFilter) filter += `&location=ilike.${encodeURIComponent(locationFilter)}`

  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    select: 'location,item_code,qty',
    limit: BASE_LIMIT,
  })) as { location?: string; item_code?: string; qty?: number }[] | null

  const byItem: Record<string, number> = {}
  for (const r of rows || []) {
    if (excludeHq && isOfficeStore(String(r.location || ''))) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    byItem[code] = (byItem[code] || 0) + Number(r.qty || 0)
  }

  let total = 0
  for (const [code, qty] of Object.entries(byItem)) {
    const cost = itemCostMap[code] ?? 0
    total += qty * cost
  }
  return total
}

export async function computeIncomeStatementReport(input: IncomeScopeInput): Promise<IncomeStatementReport> {
  const scope = normalizeIncomeScope(input)
  const { startStr, endStr, storeFilter, isHQ, yearMonth } = scope
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const warnings: string[] = []
  const limits: Record<string, { fetched: number; limit: number; total?: number }> = {}

  const itemRows = (await supabaseSelect('items', { limit: 50000, select: 'code,cost' })) as { code?: string; cost?: number }[] | null
  const itemCostMap: Record<string, number> = {}
  for (const r of itemRows || []) {
    const code = String(r.code || '').trim()
    if (code) itemCostMap[code] = Number(r.cost) || 0
  }

  let sales = 0
  let purchases = 0
  let pettyCashExpense = 0
  let bankWithdrawExpense = 0
  let fixedExpenses = 0
  let beginningInventory = 0
  let endingInventory = 0

  if (isHQ) {
    const outboundFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      `&or=(delivery_status.eq.${encodeURIComponent('배송완료')},delivery_status.eq.${encodeURIComponent('일부배송완료')})`
    const outboundOrders = (await supabaseSelectFilter('orders', outboundFilter, {
      select: 'total',
      limit: BASE_LIMIT,
    })) as { total?: number }[] | null
    for (const o of outboundOrders || []) sales += Number(o.total) || 0
    limits.orders_outbound = { fetched: outboundOrders?.length || 0, limit: BASE_LIMIT }

    purchases += await getDirectInboundPurchases('입고등록', startStr, endStr, itemCostMap, false)

    const pettyAll = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
      { select: 'store,amount,trans_type', limit: BASE_LIMIT }
    )) as { store?: string; amount?: number; trans_type?: string }[] | null
    for (const r of pettyAll || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      const st = String(r.store || '').trim()
      if (isOfficeStore(st) || st.startsWith('Office-')) {
        pettyCashExpense += Math.abs(Number(r.amount) || 0)
      }
    }
    limits.petty_cash = { fetched: pettyAll?.length || 0, limit: BASE_LIMIT }

    try {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as { id?: number; store?: string }[] | null
      const hqAccountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
        .map((a) => a.id)
        .filter((id): id is number => id != null)
      if (hqAccountIds.length > 0) {
        const idList = hqAccountIds.join(',')
        const btRows = (await supabaseSelectFilter(
          'bank_transactions',
          `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
          { select: 'amount,category,trans_date,expense_date', limit: BASE_LIMIT }
        )) as { amount?: number; category?: string; trans_date?: string; expense_date?: string }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            bankWithdrawExpense += Math.abs(Number(r.amount) || 0)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    fixedExpenses += await getFixedExpensesSum(storeFilter, yearMonth, true)
    beginningInventory = await getInventoryValue('본사', startStr, true, itemCostMap)
    endingInventory = await getInventoryValue('본사', endStr, false, itemCostMap)
  } else {
    const posFilter =
      `created_at=gte.${dayStartUtcIso}&created_at=lt.${nextDayStartUtcIso}` +
      (storeFilter !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeFilter)}` : '')
    const posOrders = (await supabaseSelectFilter('pos_orders', posFilter, {
      select: 'total,status',
      limit: BASE_LIMIT,
    })) as { total?: number; status?: string }[] | null
    const completedStatuses = new Set(['completed', 'paid', 'ready'])
    for (const o of posOrders || []) {
      if (!completedStatuses.has(String(o.status || ''))) continue
      sales += Number(o.total) || 0
    }
    limits.pos_orders = { fetched: posOrders?.length || 0, limit: BASE_LIMIT }

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&store_name=eq.${encodeURIComponent(storeFilter)}` : '')
    const orders = (await supabaseSelectFilter('orders', orderFilter, {
      select: 'total',
      limit: BASE_LIMIT,
    })) as { total?: number }[] | null
    for (const o of orders || []) purchases += Number(o.total) || 0
    limits.orders_purchase = { fetched: orders?.length || 0, limit: BASE_LIMIT }

    if (storeFilter !== 'All') {
      purchases += await getDirectInboundPurchases(storeFilter, startStr, endStr, itemCostMap, false)
    } else {
      purchases += await getDirectInboundPurchases(null, startStr, endStr, itemCostMap, true)
    }

    let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
    if (storeFilter !== 'All') pettyFilter += `&store=eq.${encodeURIComponent(storeFilter)}`
    const pettyRows = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
      select: 'amount,trans_type',
      limit: BASE_LIMIT,
    })) as { amount?: number; trans_type?: string }[] | null
    for (const r of pettyRows || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      pettyCashExpense += Math.abs(Number(r.amount) || 0)
    }
    limits.petty_cash = { fetched: pettyRows?.length || 0, limit: BASE_LIMIT }

    try {
      const bankAccRows = storeFilter !== 'All'
        ? ((await supabaseSelectFilter('bank_accounts', `store=ilike.${encodeURIComponent(storeFilter)}`, { select: 'id', limit: 2000 })) as { id?: number }[] | null)
        : ((await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null)
      const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
      if (accountIds.length > 0) {
        const idList = accountIds.join(',')
        const btRows = (await supabaseSelectFilter(
          'bank_transactions',
          `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
          { select: 'amount,category,trans_date,expense_date', limit: BASE_LIMIT }
        )) as { amount?: number; category?: string; trans_date?: string; expense_date?: string }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            bankWithdrawExpense += Math.abs(Number(r.amount) || 0)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    fixedExpenses += await getFixedExpensesSum(storeFilter, yearMonth, false)

    if (storeFilter !== 'All') {
      beginningInventory = await getInventoryValue(storeFilter, startStr, true, itemCostMap)
      endingInventory = await getInventoryValue(storeFilter, endStr, false, itemCostMap)
    } else {
      beginningInventory = await getInventoryValue(null, startStr, true, itemCostMap, true)
      endingInventory = await getInventoryValue(null, endStr, false, itemCostMap, true)
    }
  }

  if (input.includeDebug) {
    try {
      const countFilter =
        isHQ
          ? `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
          : `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
      const pettyTotalCount = await supabaseCountFilter('petty_cash_transactions', countFilter)
      if (pettyTotalCount > BASE_LIMIT) {
        warnings.push(`petty_cash_transactions 조회 건수가 limit(${BASE_LIMIT})를 초과합니다.`)
      }
      if (limits.petty_cash) limits.petty_cash.total = pettyTotalCount
    } catch {
      // ignore diagnostics errors
    }
  }

  const expenses = pettyCashExpense + bankWithdrawExpense + fixedExpenses
  const cogs = beginningInventory + purchases - endingInventory
  const grossProfit = sales - cogs
  const netProfit = grossProfit - expenses

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    sales,
    purchases,
    beginningInventory,
    endingInventory,
    cogs,
    expenses,
    grossProfit,
    netProfit,
    expenseBreakdown: {
      pettyCash: pettyCashExpense,
      bankWithdraw: bankWithdrawExpense,
      fixedExpenses,
      total: expenses,
    },
    diagnostics: input.includeDebug ? { warnings, limits } : undefined,
  }
}

function getMonthsFromYearStart(yearMonth: string): string[] {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  const months: string[] = []
  for (let mm = 1; mm <= m; mm++) {
    months.push(`${y}-${String(mm).padStart(2, '0')}`)
  }
  return months
}

const UNPOSTED_WITHDRAW_CATEGORIES = ['transfer', 'loan', 'advance', 'correction'] as const

export async function computeBalanceSheetReport(input: IncomeScopeInput): Promise<BalanceSheetReport> {
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope

  let bankAccounts: { id?: number; store?: string; opening_balance?: number }[] = []
  try {
    if (isHQ) {
      bankAccounts = ((await supabaseSelect('bank_accounts', { select: 'id,store,opening_balance', limit: 2000 })) as
        | { id?: number; store?: string; opening_balance?: number }[]
        | null)?.filter((x) => isOfficeStore(String(x.store || '')) || String(x.store || '').startsWith('Office-')) || []
    } else if (storeFilter !== 'All') {
      bankAccounts = ((await supabaseSelectFilter('bank_accounts', `store=ilike.${encodeURIComponent(storeFilter)}`, {
        select: 'id,store,opening_balance',
        limit: 2000,
      })) as { id?: number; store?: string; opening_balance?: number }[] | null) || []
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
    const idList = accountIds.join(',')
    const rows = (await supabaseSelectFilter(
      'bank_transactions',
      `account_id=in.(${idList})&trans_date=lte.${endStr}`,
      { select: 'amount', limit: 50000 }
    )) as { amount?: number }[] | null
    for (const r of rows || []) bankDelta += Number(r.amount) || 0
  }
  const cashAndBanks = openingCash + bankDelta

  const itemRows = (await supabaseSelect('items', { limit: 50000, select: 'code,cost' })) as { code?: string; cost?: number }[] | null
  const itemCostMap: Record<string, number> = {}
  for (const r of itemRows || []) {
    const code = String(r.code || '').trim()
    if (code) itemCostMap[code] = Number(r.cost) || 0
  }
  const inventory = isHQ
    ? await getInventoryValue('본사', endStr, false, itemCostMap)
    : storeFilter !== 'All'
      ? await getInventoryValue(storeFilter, endStr, false, itemCostMap)
      : await getInventoryValue(null, endStr, false, itemCostMap, false)

  let receivables = 0
  try {
    const receivableFilter = storeFilter !== 'All' && !isHQ
      ? `store_name=ilike.${encodeURIComponent(storeFilter)}`
      : 'id=gt.0'
    const recvRows = (await supabaseSelectFilter('receivable_transactions', receivableFilter, {
      select: 'amount',
      limit: 50000,
    })) as { amount?: number }[] | null
    receivables = (recvRows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  } catch {
    receivables = 0
  }

  let payables = 0
  try {
    const payRows = (await supabaseSelectFilter('payable_transactions', 'id=gt.0', {
      select: 'amount',
      limit: 50000,
    })) as { amount?: number }[] | null
    payables = (payRows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  } catch {
    payables = 0
  }

  const currentIncome = await computeIncomeStatementReport({
    yearMonth,
    storeFilter,
    userStore: input.userStore,
    userRole: input.userRole,
    includeDebug: false,
  })

  const months = getMonthsFromYearStart(yearMonth)
  let retainedEarningsYtd = 0
  for (const ym of months) {
    const income = await computeIncomeStatementReport({
      yearMonth: ym,
      storeFilter,
      userStore: input.userStore,
      userRole: input.userRole,
      includeDebug: false,
    })
    retainedEarningsYtd += income.netProfit
  }

  const openingCapital = 0
  const equityTotal = openingCapital + retainedEarningsYtd
  const assetsTotal = cashAndBanks + inventory + receivables
  const liabilitiesTotal = payables
  const balanceCheckDiff = assetsTotal - (liabilitiesTotal + equityTotal)

  let unpostedBankWithdrawals: UnpostedBankTransaction[] = []
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    const catOr = UNPOSTED_WITHDRAW_CATEGORIES.map((c) => `category.eq.${c}`).join(',')
    const filter = `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&or=(${catOr})`
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      select: 'id,trans_date,amount,category,memo,store',
      order: 'trans_date.asc',
      limit: 2000,
    })) as {
      id?: number
      trans_date?: string
      amount?: number
      category?: string
      memo?: string | null
      store?: string | null
    }[]
    unpostedBankWithdrawals = (rows || []).map((r) => ({
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
      total: assetsTotal,
    },
    liabilities: {
      payables,
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
  }
}

