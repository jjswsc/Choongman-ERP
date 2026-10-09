import {
  netBankPurchasePaymentForIncomeStatement,
} from '@/lib/accounting-bank-purchase-inbound-net'
import {
  purchaseVendorKeyMatchesRaw,
  type VendorPurchaseKeyIndex,
} from '@/lib/accounting-purchase-vendor-key'
import {
  directSettlementStoreUnitPrice,
  shouldSkipStoreInboundForHqPurchase,
} from '@/lib/accounting-reports-purchase-hq-dedupe'
import {
  purchaseInboundLocationMatchesStore,
  resolvePurchaseLocationPatterns,
} from '@/lib/accounting-stock-purchase-agg'
import { listHqOutboundPurchaseDrillLines } from '@/lib/hq-outbound-income-total'
import { loadCardBillAllocationLinesForPl } from '@/lib/card-bill-income-statement'
import {
  buildStoreFieldOrIlikeFragment,
  storeMatchesIncomeFilter,
} from '@/lib/accounting-store-match'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import {
  isSalaryLikePlExpenseRow,
  loadPayrollAggregateForIncomeStatement,
  resolveSalaryCashPlDecision,
} from '@/lib/accounting-payroll-pl'
import { plFetchEndStrWithPayrollPayWindow } from '@/lib/payroll-utils'
import { PL_PETTY_CASH_PURCHASE_VENDOR_KEY } from '@/lib/income-statement-purchase-drill-nav'
import {
  type AccountSubjectMetaRow,
  bankExpenseInPlPeriod,
  bankWithdrawCountsTowardPlExpense,
  feeAccountSubjectIdsFromMeta,
  isExpenseRoutedItem,
  isPlCogsPurchaseAccountSubject,
  isPlExpenseAccountSubject,
  loadAccountSubjectMeta,
  loadDeliveryCardFeeAccrualsForPl,
  loadItemAccountSubjectMap,
} from '@/lib/accounting-reports-expense-routing'
import {
  buildBankWithdrawPlPeriodOrFilter,
  directSettlementVendorKey,
  fetchBankWithdrawRowsForPl,
  loadDirectSettlementPurchaseLookups,
  loadHqVendorMatchIndex,
  loadInboundLinkedAmountByBankId,
  loadVendorPurchaseKeyIndex,
} from '@/lib/accounting-reports-purchase-sources'
import {
  ACCOUNTING_ROWS_MAX,
  BASE_LIMIT,
  type IncomeScopeInput,
  isHqAccountingStoreRow,
  normalizeIncomeScope,
} from '@/lib/accounting-reports-shared'

const PURCHASE_DRILL_LIMIT = 500

export type IncomeStatementPurchaseDrillInboundRow = {
  kind: 'inbound'
  id: number | null
  logDate: string
  location: string
  itemCode: string
  qty: number
  unitCost: number
  lineAmount: number
  vendorTarget: string | null
}

export type IncomeStatementPurchaseDrillBankRow = {
  kind: 'bank'
  id: number
  transDate: string
  /** 손익에 반영한 인식일. 없으면 출금일 */
  expenseDate?: string | null
  amount: number
  vendorCode: string | null
  memo: string | null
  note: string | null
  store: string | null
  /** 본사 발주와 연결 시 ref_type=Order 등 */
  refType: string | null
  refId: number | null
}

export type IncomeStatementPurchaseDrillOrderRow = {
  kind: 'hq_order'
  id: number
  orderDate: string
  total: number
  storeName: string | null
  status: string | null
}

/** 본사 창고→매장 출고 줄 — 손익 매입 본사 라인 상세 */
export type IncomeStatementPurchaseDrillHqOutboundRow = {
  kind: 'hq_outbound'
  id: number
  logDate: string
  logType: string | null
  itemCode: string
  targetStore: string | null
  qty: number
  unitPrice: number
  lineAmount: number
}

export type IncomeStatementPurchaseDrillPettyRow = {
  kind: 'petty'
  id: number
  transDate: string
  amount: number
  store: string | null
  memo: string | null
  accountSubjectId: number | null
  accountSubjectCode: string | null
  accountSubjectName: string | null
}

export type IncomeStatementPurchaseDrillDownResult = {
  vendorKey: string
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  /** 본사 출고(매입) 줄 — 매장 손익에서만 */
  isHqOrders: boolean
  /** 집계 기준: 본사 창고 출고 행 */
  hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[]
  /** 참고: 동일 기간 승인 발주(금액은 출고 집계와 다를 수 있음) */
  hqOrders: IncomeStatementPurchaseDrillOrderRow[]
  inbound: IncomeStatementPurchaseDrillInboundRow[]
  bankPayments: IncomeStatementPurchaseDrillBankRow[]
  pettyCash: IncomeStatementPurchaseDrillPettyRow[]
  truncated: { inbound: boolean; bank: boolean; orders: boolean; petty: boolean }
}

function drillVendorMatchesInboundRow(
  vendorKey: string,
  vendorTarget: string | null | undefined,
  vendorPurchaseKeyIndex: VendorPurchaseKeyIndex
): boolean {
  return purchaseVendorKeyMatchesRaw(vendorKey, vendorTarget, vendorPurchaseKeyIndex)
}

function drillVendorMatchesBankRow(
  vendorKey: string,
  vendorCode: string | null | undefined,
  vendorPurchaseKeyIndex: VendorPurchaseKeyIndex
): boolean {
  return purchaseVendorKeyMatchesRaw(vendorKey, vendorCode, vendorPurchaseKeyIndex)
}

async function listPettyCashPurchaseDrillRows(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, AccountSubjectMetaRow>
  /** 미지정 시 거래처 없는 패티 매입만 */
  vendorKey?: string
  vendorPurchaseKeyIndex?: VendorPurchaseKeyIndex
}): Promise<{ rows: IncomeStatementPurchaseDrillPettyRow[]; truncated: boolean }> {
  let pettyFilter = `trans_date=gte.${params.startStr}&trans_date=lte.${params.endStr}&trans_type=eq.expense`
  if (!params.isHQ && params.storeFilter !== 'All') {
    pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', params.storeFilter)}`
  }
  const pettyRaw = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
    select: 'id,trans_date,amount,store,memo,trans_type,account_subject_id,vendor_code',
    limit: BASE_LIMIT,
    order: 'trans_date.desc',
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    store?: string
    memo?: string | null
    trans_type?: string
    account_subject_id?: number | null
    vendor_code?: string | null
  }[] | null

  const acc: IncomeStatementPurchaseDrillPettyRow[] = []
  const vk = String(params.vendorKey || PL_PETTY_CASH_PURCHASE_VENDOR_KEY).trim()
  for (const r of pettyRaw || []) {
    if ((r.trans_type || '').toLowerCase() !== 'expense') continue
    const st = String(r.store || '').trim()
    if (params.isHQ) {
      if (!isHqAccountingStoreRow(st)) continue
    }
    if (!isPlCogsPurchaseAccountSubject(r.account_subject_id, params.subjectMeta)) continue
    const vendorCode = String(r.vendor_code || '').trim()
    if (vk === PL_PETTY_CASH_PURCHASE_VENDOR_KEY) {
      if (vendorCode) continue
    } else if (params.vendorPurchaseKeyIndex) {
      if (!drillVendorMatchesBankRow(vk, vendorCode || null, params.vendorPurchaseKeyIndex)) continue
    }
    const pid = Number(r.id)
    if (!pid) continue
    const sid =
      r.account_subject_id != null && !isNaN(Number(r.account_subject_id))
        ? Number(r.account_subject_id)
        : null
    const meta = sid != null ? params.subjectMeta.get(sid) : undefined
    acc.push({
      kind: 'petty',
      id: pid,
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      store: r.store != null ? String(r.store) : null,
      memo: r.memo != null ? String(r.memo) : null,
      accountSubjectId: sid,
      accountSubjectCode: meta?.code ?? null,
      accountSubjectName: meta?.name ?? null,
    })
  }
  const truncated = (pettyRaw?.length || 0) >= BASE_LIMIT || acc.length > PURCHASE_DRILL_LIMIT
  const rows = truncated ? acc.slice(0, PURCHASE_DRILL_LIMIT) : acc
  return { rows, truncated }
}

/** 손익 매입 거래처 행 클릭 시 — 직접입고·통장 매입지급·(매장만) 본사승인 발주 */
export async function computeIncomeStatementPurchaseDrillDown(
  input: IncomeScopeInput & { vendorKey: string }
): Promise<IncomeStatementPurchaseDrillDownResult> {
  const vendorKey = String(input.vendorKey || '').trim()
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope
  const empty: IncomeStatementPurchaseDrillDownResult = {
    vendorKey,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHqOrders: false,
    hqOutbounds: [],
    hqOrders: [],
    inbound: [],
    bankPayments: [],
    pettyCash: [],
    truncated: { inbound: false, bank: false, orders: false, petty: false },
  }
  if (!vendorKey) return empty

  if (vendorKey === PL_PETTY_CASH_PURCHASE_VENDOR_KEY) {
    const subjectMeta = await loadAccountSubjectMeta()
    const { rows, truncated } = await listPettyCashPurchaseDrillRows({
      startStr,
      endStr,
      storeFilter,
      isHQ,
      subjectMeta,
      vendorKey,
    })
    return {
      ...empty,
      pettyCash: rows,
      truncated: { ...empty.truncated, petty: truncated },
    }
  }

  if (vendorKey === '__pl_hq_orders__') {
    if (isHQ) return { ...empty, isHqOrders: true }
    const { lines: obLines, hitRowCap } = await listHqOutboundPurchaseDrillLines({
      startStr,
      endStr,
      storeFilter: storeFilter === 'All' ? null : storeFilter,
    })
    const hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[] = obLines.map((line) => ({
      kind: 'hq_outbound',
      id: line.id,
      logDate: line.logDate,
      logType: line.logType,
      itemCode: line.itemCode,
      targetStore: line.targetStore,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineAmount: line.lineAmount,
    }))
    const obTruncated = hitRowCap || hqOutbounds.length > PURCHASE_DRILL_LIMIT
    const hqOutboundsSlice = obTruncated ? hqOutbounds.slice(0, PURCHASE_DRILL_LIMIT) : hqOutbounds

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const orders = (await supabaseSelectFilterAllPages('orders', orderFilter, {
      select: 'id,order_date,total,store_name,status',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
      order: 'order_date.desc',
    })) as { id?: number; order_date?: string; total?: number; store_name?: string; status?: string }[]
    const hqOrders: IncomeStatementPurchaseDrillOrderRow[] = []
    for (const o of orders) {
      const oid = Number(o.id)
      if (!oid) continue
      hqOrders.push({
        kind: 'hq_order',
        id: oid,
        orderDate: String(o.order_date || '').slice(0, 10),
        total: Number(o.total) || 0,
        storeName: o.store_name != null ? String(o.store_name) : null,
        status: o.status != null ? String(o.status) : null,
      })
    }
    const ordTruncated = orders.length >= ACCOUNTING_ROWS_MAX || hqOrders.length > PURCHASE_DRILL_LIMIT
    const hqOrdersSlice = ordTruncated ? hqOrders.slice(0, PURCHASE_DRILL_LIMIT) : hqOrders

    return {
      ...empty,
      isHqOrders: true,
      hqOutbounds: hqOutboundsSlice,
      hqOrders: hqOrdersSlice,
      truncated: { ...empty.truncated, orders: obTruncated || ordTruncated },
    }
  }

  const [itemAccountSubjectMapDrill, subjectMetaForInbound, vendorPurchaseKeyIndexDrill] = await Promise.all([
    loadItemAccountSubjectMap(),
    loadAccountSubjectMeta(),
    loadVendorPurchaseKeyIndex(),
  ])
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const locationPatterns = await resolvePurchaseLocationPatterns(
    isHQ ? '입고등록' : storeFilter !== 'All' ? storeFilter : null,
    !isHQ && storeFilter === 'All'
  )
  let inboundFilter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (locationPatterns.length === 1) {
    inboundFilter += `&location=ilike.${encodeURIComponent(locationPatterns[0])}`
  } else if (locationPatterns.length > 1) {
    inboundFilter += `&or=(${locationPatterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
  }
  const inboundRaw = (await supabaseSelectFilterAllPages('stock_logs', inboundFilter, {
    select: 'id,log_date,location,item_code,qty,unit_cost,invoice_unit_price,vendor_target,reference_no',
    order: 'id.desc',
    pageSize: 8000,
    maxRows: ACCOUNTING_ROWS_MAX,
  })) as {
    id?: number
    log_date?: string
    location?: string
    item_code?: string
    qty?: number
    unit_cost?: number | null
    invoice_unit_price?: number | null
    vendor_target?: string
    reference_no?: string | null
  }[]

  const excludeFromHqInboundDrill = !isHQ
  const [hqVendorIndexDrill, directSettlementDrill] = await Promise.all([
    excludeFromHqInboundDrill
      ? loadHqVendorMatchIndex()
      : Promise.resolve({ codes: new Set<string>(), names: new Set<string>() }),
    excludeFromHqInboundDrill ? loadDirectSettlementPurchaseLookups() : Promise.resolve(null),
  ])
  const inboundAcc: IncomeStatementPurchaseDrillInboundRow[] = []
  for (const r of inboundRaw || []) {
    const vendorTarget = String(r.vendor_target || '').trim()
    const referenceNo = String(r.reference_no || '').trim()
    if (
      !isHQ &&
      storeFilter !== 'All' &&
      !purchaseInboundLocationMatchesStore(String(r.location || ''), storeFilter)
    ) {
      continue
    }
    const codeEarly = String(r.item_code || '').trim()
    const directVendorKey =
      directSettlementDrill && codeEarly
        ? directSettlementVendorKey(codeEarly, directSettlementDrill)
        : null
    if (
      shouldSkipStoreInboundForHqPurchase(vendorTarget, referenceNo, excludeFromHqInboundDrill, hqVendorIndexDrill) &&
      !directVendorKey
    ) {
      continue
    }
    if (
      !isHQ &&
      storeFilter === 'All' &&
      (r.location === '입고등록' || isHqAccountingStoreRow(String(r.location || '')))
    ) {
      continue
    }
    const matchVendor = directVendorKey || vendorTarget
    if (!drillVendorMatchesInboundRow(vendorKey, matchVendor, vendorPurchaseKeyIndexDrill)) continue
    const code = codeEarly
    if (!code) continue
    const routed = isExpenseRoutedItem(code, itemAccountSubjectMapDrill, subjectMetaForInbound)
    if (routed.isExpense) continue
    const qty = Number(r.qty) || 0
    const unitCost = directVendorKey
      ? directSettlementStoreUnitPrice({
          invoiceUnitPrice: r.invoice_unit_price,
          masterPrice: directSettlementDrill?.priceByItem.get(code) || 0,
          masterCost: 0,
        })
      : r.invoice_unit_price != null && !isNaN(Number(r.invoice_unit_price))
        ? Number(r.invoice_unit_price)
        : r.unit_cost != null && !isNaN(Number(r.unit_cost))
          ? Number(r.unit_cost)
          : 0
    const lineAmount = qty * unitCost
    if (!lineAmount) continue
    inboundAcc.push({
      kind: 'inbound',
      id: r.id != null ? Number(r.id) : null,
      logDate: String(r.log_date || '').slice(0, 10),
      location: String(r.location || '').trim(),
      itemCode: code,
      qty,
      unitCost,
      lineAmount,
      vendorTarget: (directVendorKey || vendorTarget) || null,
    })
  }
  const inboundFetchTruncated = (inboundRaw?.length || 0) >= ACCOUNTING_ROWS_MAX
  const inboundTruncated = inboundFetchTruncated || inboundAcc.length > PURCHASE_DRILL_LIMIT
  const inbound = inboundTruncated ? inboundAcc.slice(0, PURCHASE_DRILL_LIMIT) : inboundAcc

  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => Number(a.id))
        .filter((id) => !isNaN(id) && id > 0)
    } else if (storeFilter !== 'All') {
      const bankAccRows = (await supabaseSelectFilter(
        'bank_accounts',
        buildStoreFieldOrIlikeFragment('store', storeFilter),
        { select: 'id', limit: 2000 }
      )) as { id?: number }[] | null
      accountIds = (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    } else {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null
      accountIds = (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    }
  } catch {
    accountIds = []
  }

  const bankAcc: IncomeStatementPurchaseDrillBankRow[] = []
  /** 그 거래처 직접입고가 있으면 통장 줄은 숨긴다. 입고가 없으면 인식일 기준 매입 대금을 보여 준다. */
  const includeBankPaymentsInDrill = inboundAcc.length === 0
  if (includeBankPaymentsInDrill && accountIds.length > 0) {
    const idList = accountIds.join(',')
    let btRows: {
      id?: number
      trans_date?: string
      expense_date?: string | null
      amount?: number
      vendor_code?: string
      memo?: string | null
      note?: string | null
      store?: string | null
      ref_type?: string | null
      ref_id?: number | null
    }[] = []
    try {
      btRows = (await supabaseSelectFilterAllPages(
        'bank_transactions',
        `account_id=in.(${idList})&trans_type=eq.withdraw&category=eq.purchase_payment&${buildBankWithdrawPlPeriodOrFilter(startStr, endStr)}`,
        {
          select: 'id,trans_date,expense_date,amount,vendor_code,memo,note,store,ref_type,ref_id',
          order: 'trans_date.desc',
          pageSize: 8000,
          maxRows: ACCOUNTING_ROWS_MAX,
        }
      )) as typeof btRows
    } catch {
      btRows = []
    }
    const linkedByBankIdDrill = await loadInboundLinkedAmountByBankId(
      btRows.map((r) => Number(r.id)).filter((id) => id > 0)
    )
    for (const r of btRows) {
      if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
      if (storeFilter !== 'All') {
        const bts = String(r.store || '').trim()
        if (isHQ) {
          if (bts && !isHqAccountingStoreRow(bts)) continue
        } else {
          if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
        }
      }
      if (!drillVendorMatchesBankRow(vendorKey, r.vendor_code, vendorPurchaseKeyIndexDrill)) continue
      const id = Number(r.id)
      if (!id) continue
      const netAmt = netBankPurchasePaymentForIncomeStatement(
        Number(r.amount) || 0,
        linkedByBankIdDrill.get(id) || 0
      )
      if (netAmt <= 0) continue
      const rid = r.ref_id != null && !isNaN(Number(r.ref_id)) ? Number(r.ref_id) : null
      bankAcc.push({
        kind: 'bank',
        id,
        transDate: String(r.trans_date || '').slice(0, 10),
        expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : null,
        amount: netAmt,
        vendorCode: r.vendor_code != null ? String(r.vendor_code).trim() || null : null,
        memo: r.memo != null ? String(r.memo) : null,
        note: r.note != null ? String(r.note) : null,
        store: r.store != null ? String(r.store) : null,
        refType: r.ref_type != null ? String(r.ref_type).trim() || null : null,
        refId: rid,
      })
    }
  }
  const bankTruncated = bankAcc.length > PURCHASE_DRILL_LIMIT
  const bankPayments = bankTruncated ? bankAcc.slice(0, PURCHASE_DRILL_LIMIT) : bankAcc

  const subjectMetaDrill = subjectMetaForInbound
  const { rows: pettyCash, truncated: pettyTruncated } = await listPettyCashPurchaseDrillRows({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta: subjectMetaDrill,
    vendorKey,
    vendorPurchaseKeyIndex: vendorPurchaseKeyIndexDrill,
  })

  return {
    vendorKey,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHqOrders: false,
    hqOutbounds: [],
    hqOrders: [],
    inbound,
    bankPayments,
    pettyCash,
    truncated: {
      inbound: inboundTruncated,
      bank: bankTruncated,
      orders: false,
      petty: pettyTruncated,
    },
  }
}

function expenseDrillMatchesSubject(
  rowSubjectId: number | null | undefined,
  wantSubjectId: number | null
): boolean {
  const sid =
    rowSubjectId != null && !isNaN(Number(rowSubjectId)) ? Number(rowSubjectId) : null
  if (wantSubjectId == null) return sid == null
  return sid === wantSubjectId
}

async function resolveBankAccountIdsForIncomeScope(
  isHQ: boolean,
  storeFilter: string
): Promise<number[]> {
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      return (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => Number(a.id))
        .filter((id) => !isNaN(id) && id > 0)
    }
    if (storeFilter !== 'All') {
      const bankAccRows = (await supabaseSelectFilter(
        'bank_accounts',
        buildStoreFieldOrIlikeFragment('store', storeFilter),
        { select: 'id', limit: 2000 }
      )) as { id?: number }[] | null
      return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
    }
    const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as
      | { id?: number }[]
      | null
    return (bankAccRows || []).map((a) => Number(a.id)).filter((id) => !isNaN(id) && id > 0)
  } catch {
    return []
  }
}

const EXPENSE_DRILL_LIMIT = 500

export type IncomeStatementExpenseDrillPettyRow = {
  kind: 'petty'
  id: number
  transDate: string
  amount: number
  store: string | null
  memo: string | null
  transType: string
}

export type IncomeStatementExpenseDrillBankRow = {
  kind: 'bank'
  id: number
  transDate: string
  expenseDate: string | null
  amount: number
  category: string | null
  memo: string | null
  store: string | null
}

export type IncomeStatementExpenseDrillFixedRow = {
  kind: 'fixed'
  id: number
  name: string
  store: string
  monthlyAmount: number
  startYearMonth: string | null
  endYearMonth: string | null
  memo: string | null
}

export type IncomeStatementExpenseDrillPayrollRow = {
  kind: 'payroll'
  id: number
  name: string
  store: string
  amount: number
  netPay: number
  sso: number
  tax: number
}

export type IncomeStatementExpenseDrillDownResult = {
  accountSubjectKey: string
  accountSubjectId: number | null
  yearMonth: string
  startStr: string
  endStr: string
  storeFilter: string
  petty: IncomeStatementExpenseDrillPettyRow[]
  bankWithdrawals: IncomeStatementExpenseDrillBankRow[]
  fixedExpenses: IncomeStatementExpenseDrillFixedRow[]
  payroll: IncomeStatementExpenseDrillPayrollRow[]
  truncated: { petty: boolean; bank: boolean; fixed: boolean; payroll: boolean }
}

/** 손익 비용 계정 행 클릭 — 패티 지출·통장 출금(손익 반영분)·고정비 */
export async function computeIncomeStatementExpenseDrillDown(
  input: IncomeScopeInput & { accountSubjectKey: string }
): Promise<IncomeStatementExpenseDrillDownResult> {
  const accountSubjectKey = String(input.accountSubjectKey || '').trim()
  const wantSubjectId =
    accountSubjectKey === '__unclassified__' || accountSubjectKey === ''
      ? null
      : Number(accountSubjectKey)
  const scope = normalizeIncomeScope(input)
  const { yearMonth, startStr, endStr, storeFilter, isHQ } = scope
  const empty: IncomeStatementExpenseDrillDownResult = {
    accountSubjectKey,
    accountSubjectId: wantSubjectId != null && !isNaN(wantSubjectId) ? wantSubjectId : null,
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    petty: [],
    bankWithdrawals: [],
    fixedExpenses: [],
    payroll: [],
    truncated: { petty: false, bank: false, fixed: false, payroll: false },
  }
  if (wantSubjectId != null && isNaN(wantSubjectId)) return empty

  const subjectMeta = await loadAccountSubjectMeta()
  const payrollAgg = await loadPayrollAggregateForIncomeStatement({
    yearMonth,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  const payrollMatchesSubject =
    payrollAgg.total > 0 &&
    (wantSubjectId == null
      ? payrollAgg.preferredSubjectId == null
      : payrollAgg.preferredSubjectId === wantSubjectId ||
        payrollAgg.salarySubjectIds.has(wantSubjectId))

  const payrollPayWindowEndStr = plFetchEndStrWithPayrollPayWindow(endStr)
  const salaryDrillDecision = (row: {
    account_subject_id?: number | null
    memo?: string | null
    trans_date?: string | null
    expense_date?: string | null
  }) =>
    resolveSalaryCashPlDecision({
      isSalaryLike: isSalaryLikePlExpenseRow({
        accountSubjectId: row.account_subject_id,
        memo: row.memo,
        subjectMeta,
        salarySubjectIds: payrollAgg.salarySubjectIds,
      }),
      payrollExpenseThisMonth: payrollAgg.total,
      transDate: row.trans_date,
      expenseDate: row.expense_date,
      plYearMonth: yearMonth,
    })

  let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`
  if (!isHQ && storeFilter !== 'All') {
    pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
  }
  const pettyRaw = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
    select: 'id,trans_date,amount,store,memo,trans_type,account_subject_id',
    limit: BASE_LIMIT,
    order: 'trans_date.desc',
  })) as {
    id?: number
    trans_date?: string
    amount?: number
    store?: string
    memo?: string | null
    trans_type?: string
    account_subject_id?: number | null
  }[] | null

  const petty: IncomeStatementExpenseDrillPettyRow[] = []
  for (const r of pettyRaw || []) {
    const st = String(r.store || '').trim()
    if (isHQ) {
      if (!isHqAccountingStoreRow(st)) continue
    }
    if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
    if (!isPlExpenseAccountSubject(r.account_subject_id, subjectMeta)) continue
    const salaryDecision = salaryDrillDecision(r)
    if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
    if (salaryDecision === 'not-salary') {
      const td = String(r.trans_date || '').slice(0, 10)
      if (td < startStr || td > endStr) continue
    }
    const pid = Number(r.id)
    if (!pid) continue
    petty.push({
      kind: 'petty',
      id: pid,
      transDate: String(r.trans_date || '').slice(0, 10),
      amount: Math.abs(Number(r.amount) || 0),
      store: r.store != null ? String(r.store) : null,
      memo: r.memo != null ? String(r.memo) : null,
      transType: String(r.trans_type || 'expense'),
    })
  }
  const pettyTruncated = (pettyRaw?.length || 0) >= BASE_LIMIT || petty.length > EXPENSE_DRILL_LIMIT
  const pettySlice = pettyTruncated ? petty.slice(0, EXPENSE_DRILL_LIMIT) : petty

  const accountIds = await resolveBankAccountIdsForIncomeScope(isHQ, storeFilter)
  const bankAcc: IncomeStatementExpenseDrillBankRow[] = []
  let bankFetchTruncated = false
  const feeAccrualPl = await loadDeliveryCardFeeAccrualsForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  const cardBillPl = await loadCardBillAllocationLinesForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
  })
  const feeAccountSubjectIds = new Set(feeAccountSubjectIdsFromMeta(subjectMeta).allIds)
  if (accountIds.length > 0) {
    const { rows: btRows, truncated } = await fetchBankWithdrawRowsForPl(
      accountIds,
      startStr,
      payrollPayWindowEndStr,
      {
        feeAccountSubjectIds,
      }
    )
    bankFetchTruncated = truncated
    for (const r of btRows) {
      if (!bankWithdrawCountsTowardPlExpense(r.category)) continue
      const salaryDecision = salaryDrillDecision(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
      }
      if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
      if (!isPlExpenseAccountSubject(r.account_subject_id, subjectMeta)) continue
      const bid = Number(r.id)
      if (!bid) continue
      // 손익 본표와 동일: 수수료 지급예정·카드 대금 배분에 연결된 통장은 이중 표시 제외
      if (feeAccrualPl.linkedBankTransactionIds.has(bid)) continue
      if (cardBillPl.linkedBankTransactionIds.has(bid)) continue
      bankAcc.push({
        kind: 'bank',
        id: bid,
        transDate: String(r.trans_date || '').slice(0, 10),
        expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : null,
        amount: Math.abs(Number(r.amount) || 0),
        category: r.category != null ? String(r.category) : null,
        memo: r.memo != null ? String(r.memo) : null,
        store: r.store != null ? String(r.store) : null,
      })
    }
  }
  // 5528/5529 지급예정 — 본표에 포함된 accrual을 드릴에도 표시
  for (const ar of feeAccrualPl.rows) {
    if (!expenseDrillMatchesSubject(ar.accountSubjectId, wantSubjectId)) continue
    const memoParts = ['[지급예정]', ar.memo || ''].filter(Boolean)
    bankAcc.push({
      kind: 'bank',
      id: ar.id,
      transDate: ar.expenseDate || startStr,
      expenseDate: ar.expenseDate || null,
      amount: ar.amount,
      category: 'expense_accrual',
      memo: memoParts.join(' ').trim() || '[지급예정]',
      store: ar.store,
    })
  }
  for (const line of cardBillPl.lines) {
    if (!expenseDrillMatchesSubject(line.accountSubjectId, wantSubjectId)) continue
    if (!isPlExpenseAccountSubject(line.accountSubjectId, subjectMeta)) continue
    const memoParts = ['[카드배분]', line.memo || ''].filter(Boolean)
    bankAcc.push({
      kind: 'bank',
      id: line.id,
      transDate: line.transDate || startStr,
      expenseDate: line.transDate || null,
      amount: line.amount,
      category: 'card_bill',
      memo: memoParts.join(' ').trim() || '[카드배분]',
      store: line.store,
    })
  }
  const bankTruncated = bankFetchTruncated || bankAcc.length > EXPENSE_DRILL_LIMIT
  const bankSlice = bankTruncated ? bankAcc.slice(0, EXPENSE_DRILL_LIMIT) : bankAcc

  const fixedRows: IncomeStatementExpenseDrillFixedRow[] = []
  try {
    const fxAll = (await supabaseSelect('fixed_expenses', {
      select: 'id,name,store,monthly_amount,start_year_month,end_year_month,memo,account_subject_id',
      limit: 2000,
    })) as {
      id?: number
      name?: string
      store?: string
      monthly_amount?: number
      start_year_month?: string | null
      end_year_month?: string | null
      memo?: string | null
      account_subject_id?: number | null
    }[] | null
    for (const r of fxAll || []) {
      const start = r.start_year_month ? String(r.start_year_month) : null
      const end = r.end_year_month ? String(r.end_year_month) : null
      const active = (!start || yearMonth >= start) && (!end || yearMonth <= end)
      if (!active) continue
      const st = String(r.store || '').trim()
      if (isHQ) {
        if (!isHqAccountingStoreRow(st)) continue
      } else if (storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      if (!expenseDrillMatchesSubject(r.account_subject_id, wantSubjectId)) continue
      const fid = Number(r.id)
      if (!fid) continue
      fixedRows.push({
        kind: 'fixed',
        id: fid,
        name: String(r.name || '').trim() || '—',
        store: st,
        monthlyAmount: Number(r.monthly_amount) || 0,
        startYearMonth: start,
        endYearMonth: end,
        memo: r.memo != null ? String(r.memo).trim() || null : null,
      })
    }
  } catch {
    // fixed_expenses 미배포
  }
  const fixedTruncated = fixedRows.length > EXPENSE_DRILL_LIMIT
  const fixedSlice = fixedTruncated ? fixedRows.slice(0, EXPENSE_DRILL_LIMIT) : fixedRows

  const payrollRows: IncomeStatementExpenseDrillPayrollRow[] = []
  if (payrollMatchesSubject) {
    for (const r of payrollAgg.records) {
      payrollRows.push({
        kind: 'payroll',
        id: r.id,
        name: r.name,
        store: r.store,
        amount: r.amount,
        netPay: r.netPay,
        sso: r.sso,
        tax: r.tax,
      })
    }
  }
  const payrollTruncated = payrollRows.length > EXPENSE_DRILL_LIMIT
  const payrollSlice = payrollTruncated ? payrollRows.slice(0, EXPENSE_DRILL_LIMIT) : payrollRows

  return {
    ...empty,
    petty: pettySlice,
    bankWithdrawals: bankSlice,
    fixedExpenses: fixedSlice,
    payroll: payrollSlice,
    truncated: {
      petty: pettyTruncated,
      bank: bankTruncated,
      fixed: fixedTruncated,
      payroll: payrollTruncated,
    },
  }
}
