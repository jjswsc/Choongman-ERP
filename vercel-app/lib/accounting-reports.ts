import {
  supabaseCountFilter,
  supabaseSelect,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import { getBangkokDateRangeUtc, getBangkokMonthRange } from '@/lib/bangkok-time'
import { storeCodeSearchVariants } from '@/lib/pos-sales-store-filter'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']
const BASE_LIMIT = 20000

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type IncomeScopeInput = {
  yearMonth?: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  includeDebug?: boolean
}

export type IncomeStatementLineDetail = {
  /** UI에서 `__pl_hq_orders__` 등 특수 키면 i18n으로 치환 */
  key: string
  amount: number
  /** vendors.name — 있으면 화면·엑셀에 코드 대신 표시 */
  label?: string
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
  /** 계정과목(세부)별 비용 — 현금시재·통장출금·고정비 합산 (표시명은 클라이언트에서 lang 반영) */
  expenseByAccountSubject?: {
    accountSubjectId: number | null
    code: string
    name: string
    nameEn: string | null
    nameTh: string | null
    amount: number
  }[]
  /** 매장: 본사 발주 + 직접입고 거래처별. 본사: 입고 거래처별 */
  purchaseByVendor?: IncomeStatementLineDetail[]
  /** 본사: 출고(배송완료) 발주의 주문 매장(store_name)별 매출 */
  salesByCustomer?: IncomeStatementLineDetail[]
  diagnostics?: {
    warnings: string[]
    limits: Record<string, { fetched: number; limit: number; total?: number }>
    /** 직접 입고·통장 매입지급에 동시에 잡힌 거래처 키 — 이중 집계 가능성 안내 */
    purchaseInboundBankOverlapVendorKeys?: string[]
    /** 매장만: 본사 창고 출고 금액 vs 승인 발주 합계(참고) — 직납 등으로 차이 날 수 있음 */
    purchaseHqOutboundBasis?: {
      outboundTotal: number
      approvedOrdersTotal: number
      diff: number
    }
    /** 매장만: vendors.type=본사 등으로 통장 매입지급을 매입 합계에서 제외한 금액(출고·발주와 이중 방지) */
    purchaseExcludedHqBankPayments?: { key: string; amount: number; label?: string }[]
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

/**
 * 손익·재고 등 매장 스코프: 드롭다운 값(직원 store 문자열) + POS `store_code` 표기(CM 접두 등) 통일.
 * @see storeCodeSearchVariants — 매출 API와 동일 규칙
 */
function incomeStoreSearchVariants(term: string): string[] {
  const raw = String(term || '').trim()
  if (!raw) return []
  return [...new Set([raw, ...storeCodeSearchVariants(raw)])].filter(Boolean)
}

/** PostgREST 단일 컬럼: 변형 중 하나라도 ilike 일치 (이름·코드 혼용 DB 대응) */
function buildStoreFieldOrIlikeFragment(field: string, storeFilter: string): string {
  if (!storeFilter || storeFilter === 'All') return ''
  if (storeFilter === '입고등록') {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`
  }
  const variants = incomeStoreSearchVariants(storeFilter)
  if (variants.length === 1) {
    return `${field}=ilike.${encodeURIComponent(sqlIlikeContains(variants[0]))}`
  }
  const inner = variants.map((v) => `${field}.ilike.${encodeURIComponent(sqlIlikeContains(v))}`).join(',')
  return `or=(${inner})`
}

/**
 * pos_orders.store_code 기준: **정확 일치(eq)** + **부분 일치(ilike)** 를 OR로 묶음.
 * ERP 매장명과 POS 코드가 같을 때는 eq가 우선, 다를 때 ilike·CM 변형으로 보조.
 */
function buildPosStoreCodeFilterFragment(storeFilter: string): string {
  if (!storeFilter || storeFilter === 'All') return ''
  const variants = incomeStoreSearchVariants(storeFilter)
  const clauses: string[] = []
  const seen = new Set<string>()
  for (const v of variants) {
    const t = String(v).trim()
    if (!t) continue
    const eq = `store_code.eq.${encodeURIComponent(t)}`
    const like = `store_code.ilike.${encodeURIComponent(sqlIlikeContains(t))}`
    for (const c of [eq, like]) {
      if (!seen.has(c)) {
        seen.add(c)
        clauses.push(c)
      }
    }
  }
  if (clauses.length === 0) return ''
  if (clauses.length === 1) return clauses[0]
  return `or=(${clauses.join(',')})`
}

/** 손익·통장 행 등 JS 측 매장 매칭 (변형 허용) */
export function storeMatchesIncomeFilter(storeValue: string, filter: string): boolean {
  const a = String(storeValue || '').trim().toLowerCase()
  if (!filter || filter.trim().toLowerCase() === 'all') return true
  if (!a) return false
  for (const v of incomeStoreSearchVariants(filter)) {
    const b = String(v || '').trim().toLowerCase()
    if (!b) continue
    if (a === b || a.includes(b) || b.includes(a)) return true
  }
  return false
}

function sqlIlikeContains(term: string): string {
  const t = String(term || '').trim()
  if (!t) return '%'
  return `%${t.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

/** vendors.code(대소문자 무시) → 표시용 이름 */
async function loadVendorCodeNormToNameMap(): Promise<Record<string, string>> {
  try {
    const rows = (await supabaseSelect('vendors', { select: 'code,name', limit: 20000 })) as
      | { code?: string; name?: string }[]
      | null
    const m: Record<string, string> = {}
    for (const r of rows || []) {
      const c = String(r.code || '').trim()
      const n = String(r.name || '').trim()
      if (!c) continue
      m[c.toLowerCase()] = n || c
    }
    return m
  } catch {
    return {}
  }
}

function enrichPurchaseByVendorLabels(
  rows: IncomeStatementLineDetail[],
  vendorNormToName: Record<string, string>
): IncomeStatementLineDetail[] {
  return rows.map((r) => {
    const k = String(r.key || '').trim()
    if (!k || k.startsWith('__pl_')) return { ...r }
    const name = vendorNormToName[k.toLowerCase()]
    return name ? { ...r, label: name } : { ...r }
  })
}

/** 같은 기간에 직접입고와 통장 매입지급(purchase_payment) 모두 양수인 거래처 코드 */
function collectInboundBankOverlapVendorKeys(
  inbound: Record<string, number>,
  bank: Record<string, number>
): string[] {
  const out: string[] = []
  for (const k of Object.keys(inbound)) {
    if ((Number(inbound[k]) || 0) > 0 && (Number(bank[k]) || 0) > 0) out.push(k)
  }
  out.sort()
  return out
}

function mergeVendorAmountMap(target: Record<string, number>, add: Record<string, number>) {
  for (const [k, v] of Object.entries(add)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    target[k] = (target[k] || 0) + amt
  }
}

/** 본사(Head Office) 법인 등 — 통장 매입지급을 손익 매입에서 제외할 거래처 코드(소문자) */
async function loadHqVendorCodeNormSet(): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const rows = (await supabaseSelect('vendors', { select: 'code,type', limit: 20000 })) as
      | { code?: string; type?: string }[]
      | null
    for (const r of rows || []) {
      const t = String(r.type || '').trim().toLowerCase()
      if (t === '본사' || t === 'head office' || t === 'hq') {
        const c = String(r.code || '').trim().toLowerCase()
        if (c) out.add(c)
      }
    }
  } catch {
    // ignore
  }
  return out
}

/**
 * 본사 창고에서 매장으로 나간 출고(Outbound / ForceOutbound) 금액 합계 — 손익 매입의 본사 라인 기준.
 * 단가: invoice_unit_price → 품목 cost.
 */
async function sumHqOutboundPurchaseFromOffice(
  storeFilter: string | null,
  startStr: string,
  endStr: string,
  itemCostMap: Record<string, number>
): Promise<number> {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let filter =
    `log_type=in.(Outbound,ForceOutbound)` +
    `&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}` +
    `&${buildStoreFieldOrIlikeFragment('location', '본사')}`
  if (storeFilter && storeFilter !== 'All') {
    filter += `&${buildStoreFieldOrIlikeFragment('vendor_target', storeFilter)}`
  }
  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    select: 'item_code,qty,invoice_unit_price',
    limit: BASE_LIMIT,
  })) as { item_code?: string; qty?: number; invoice_unit_price?: number | null }[] | null
  let total = 0
  for (const r of rows || []) {
    const qty = Math.abs(Number(r.qty) || 0)
    if (!qty) continue
    const code = String(r.item_code || '').trim()
    const unit =
      r.invoice_unit_price != null && !isNaN(Number(r.invoice_unit_price))
        ? Number(r.invoice_unit_price)
        : (itemCostMap[code] ?? 0)
    total += qty * unit
  }
  return total
}

function buildHqOutboundFromOfficeFilter(
  storeFilter: string | null,
  dayStartUtcIso: string,
  nextDayStartUtcIso: string
): string {
  let filter =
    `log_type=in.(Outbound,ForceOutbound)` +
    `&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}` +
    `&${buildStoreFieldOrIlikeFragment('location', '본사')}`
  if (storeFilter && storeFilter !== 'All') {
    filter += `&${buildStoreFieldOrIlikeFragment('vendor_target', storeFilter)}`
  }
  return filter
}

/**
 * 통장 출금 중 category=purchase_payment — 손익 '매입' 거래처별 내역에 반영 (미지급 정산 지급).
 * COGS용 입고·발주와 중복될 수 있으나, 사용자가 통장에서만 매입처를 구분해 등록한 경우 표시 누락을 막기 위함.
 */
async function fetchBankPurchasePaymentsByVendor(params: {
  isHQ: boolean
  storeFilter: string
  startStr: string
  endStr: string
}): Promise<Record<string, number>> {
  const { isHQ, storeFilter, startStr, endStr } = params
  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
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
    return {}
  }
  if (accountIds.length === 0) return {}
  const idList = accountIds.join(',')
  let btRows: { amount?: number; vendor_code?: string; store?: string | null }[] | null
  try {
    btRows = (await supabaseSelectFilter(
      'bank_transactions',
      `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
      { select: 'amount,vendor_code,store', limit: BASE_LIMIT }
    )) as { amount?: number; vendor_code?: string; store?: string | null }[] | null
  } catch {
    return {}
  }
  const out: Record<string, number> = {}
  for (const r of btRows || []) {
    if (storeFilter !== 'All') {
      const bts = String(r.store || '').trim()
      if (isHQ) {
        if (bts && !isOfficeStore(bts) && !bts.startsWith('Office-')) continue
      } else {
        if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
      }
    }
    const v = String(r.vendor_code || '').trim() || '__pl_vendor_unknown__'
    out[v] = (out[v] || 0) + Math.abs(Number(r.amount) || 0)
  }
  return out
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

async function getDirectInboundPurchasesByVendor(
  locationFilter: string | null,
  startStr: string,
  endStr: string,
  itemCostMap: Record<string, number>,
  excludeHqLocations = false
): Promise<Record<string, number>> {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let filter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (locationFilter) filter += `&${buildStoreFieldOrIlikeFragment('location', locationFilter)}`

  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    select: 'item_code,qty,unit_cost,vendor_target,location',
    limit: BASE_LIMIT,
  })) as { item_code?: string; qty?: number; unit_cost?: number | null; vendor_target?: string; location?: string }[] | null

  const byVendor: Record<string, number> = {}
  for (const r of rows || []) {
    if (String(r.vendor_target || '').trim() === 'From HQ') continue
    if (excludeHqLocations && (r.location === '입고등록' || isOfficeStore(String(r.location || '')))) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    const qty = Number(r.qty) || 0
    const unitCost = r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : (itemCostMap[code] ?? 0)
    const line = qty * unitCost
    if (!line) continue
    const vRaw = String(r.vendor_target || '').trim()
    const vKey = vRaw || '__pl_vendor_unknown__'
    byVendor[vKey] = (byVendor[vKey] || 0) + line
  }
  return byVendor
}

async function getFixedExpensesAggregate(
  storeFilter: string,
  yearMonthStr: string,
  isHQ: boolean
): Promise<{ total: number; byAccountSubjectId: Map<number | null, number> }> {
  const byAccountSubjectId = new Map<number | null, number>()
  try {
    const all = (await supabaseSelect('fixed_expenses', {
      select: 'store,monthly_amount,start_year_month,end_year_month,account_subject_id',
      limit: 2000,
    })) as
      | {
          store?: string
          monthly_amount?: number
          start_year_month?: string | null
          end_year_month?: string | null
          account_subject_id?: number | null
        }[]
      | null
    if (!all?.length) return { total: 0, byAccountSubjectId }
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
        if (!storeMatchesIncomeFilter(st, storeFilter)) continue
      }
      const amt = Number(r.monthly_amount) || 0
      total += amt
      const sid = r.account_subject_id != null && !isNaN(Number(r.account_subject_id)) ? Number(r.account_subject_id) : null
      byAccountSubjectId.set(sid, (byAccountSubjectId.get(sid) || 0) + amt)
    }
    return { total, byAccountSubjectId }
  } catch {
    return { total: 0, byAccountSubjectId }
  }
}

function addToSubjectMap(map: Map<number | null, number>, subjectId: number | null | undefined, amount: number) {
  if (!amount) return
  const sid = subjectId != null && !isNaN(Number(subjectId)) ? Number(subjectId) : null
  map.set(sid, (map.get(sid) || 0) + amount)
}

type AccountSubjectMetaRow = {
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
}

async function loadAccountSubjectMeta(): Promise<Map<number, AccountSubjectMetaRow>> {
  const out = new Map<number, AccountSubjectMetaRow>()
  try {
    const rows = (await supabaseSelect('account_subjects', {
      select: 'id,code,name,name_en,name_th',
      limit: 2000,
      order: 'sort_order.asc,code.asc',
    })) as { id?: number; code?: string; name?: string; name_en?: string | null; name_th?: string | null }[] | null
    for (const r of rows || []) {
      const id = r.id != null ? Number(r.id) : NaN
      if (isNaN(id)) continue
      const code = String(r.code || '').trim()
      const name = String(r.name || '').trim()
      const ne = r.name_en != null ? String(r.name_en).trim() : ''
      const nt = r.name_th != null ? String(r.name_th).trim() : ''
      out.set(id, {
        code,
        name,
        nameEn: ne || null,
        nameTh: nt || null,
      })
    }
  } catch {
    // ignore
  }
  return out
}

function mergeExpenseSubjectMaps(
  target: Map<number | null, number>,
  source: Map<number | null, number>
) {
  for (const [k, v] of source) {
    target.set(k, (target.get(k) || 0) + v)
  }
}

function buildExpenseByAccountList(
  map: Map<number | null, number>,
  meta: Map<number, AccountSubjectMetaRow>
): IncomeStatementReport['expenseByAccountSubject'] {
  const rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']> = []
  for (const [sid, amt] of map) {
    if (!amt) continue
    if (sid == null) {
      rows.push({
        accountSubjectId: null,
        code: '',
        name: '',
        nameEn: null,
        nameTh: null,
        amount: amt,
      })
      continue
    }
    const m = meta.get(sid)
    rows.push({
      accountSubjectId: sid,
      code: m?.code ?? '',
      name: m?.name ?? '',
      nameEn: m?.nameEn ?? null,
      nameTh: m?.nameTh ?? null,
      amount: amt,
    })
  }
  rows.sort((a, b) => b.amount - a.amount)
  return rows
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
  if (locationFilter) filter += `&${buildStoreFieldOrIlikeFragment('location', locationFilter)}`

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
  let purchaseInboundBankOverlapVendorKeys: string[] = []

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
  const expenseBySubjectMap = new Map<number | null, number>()
  let ordersPurchaseSubtotal = 0
  let purchaseByVendor: IncomeStatementLineDetail[] = []
  let salesByCustomer: IncomeStatementLineDetail[] = []
  let purchaseHqOutboundBasis:
    | { outboundTotal: number; approvedOrdersTotal: number; diff: number }
    | undefined = undefined
  let purchaseExcludedHqBankPayments: { key: string; amount: number; label?: string }[] | undefined = undefined
  const excludedHqBankPaymentsRaw: { key: string; amount: number }[] = []

  if (isHQ) {
    const outboundFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      `&or=(delivery_status.eq.${encodeURIComponent('배송완료')},delivery_status.eq.${encodeURIComponent('일부배송완료')})`
    const outboundOrders = (await supabaseSelectFilter('orders', outboundFilter, {
      select: 'total,store_name',
      limit: BASE_LIMIT,
    })) as { total?: number; store_name?: string }[] | null
    const salesByStoreMap: Record<string, number> = {}
    for (const o of outboundOrders || []) {
      const amt = Number(o.total) || 0
      sales += amt
      const raw = String(o.store_name || '').trim()
      const k = raw || '__pl_sales_customer_unknown__'
      salesByStoreMap[k] = (salesByStoreMap[k] || 0) + amt
    }
    limits.orders_outbound = { fetched: outboundOrders?.length || 0, limit: BASE_LIMIT }
    salesByCustomer = Object.entries(salesByStoreMap)
      .filter(([, v]) => v > 0)
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount)

    const inboundByVendorHq = await getDirectInboundPurchasesByVendor('입고등록', startStr, endStr, itemCostMap, false)
    const bankPayByVendorHq = await fetchBankPurchasePaymentsByVendor({
      isHQ: true,
      storeFilter,
      startStr,
      endStr,
    })
    const purchaseVendorMapHq: Record<string, number> = { ...inboundByVendorHq }
    mergeVendorAmountMap(purchaseVendorMapHq, bankPayByVendorHq)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorHq,
      bankPayByVendorHq
    )
    /** 거래처별 내역과 동일: 직접입고 + 통장 매입지급(purchase_payment) */
    purchases += Object.values(purchaseVendorMapHq).reduce((a, b) => a + b, 0)

    const pettyAll = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`,
      { select: 'store,amount,trans_type,account_subject_id', limit: BASE_LIMIT }
    )) as { store?: string; amount?: number; trans_type?: string; account_subject_id?: number | null }[] | null
    for (const r of pettyAll || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      const st = String(r.store || '').trim()
      if (isOfficeStore(st) || st.startsWith('Office-')) {
        const amt = Math.abs(Number(r.amount) || 0)
        pettyCashExpense += amt
        addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
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
          { select: 'amount,category,trans_date,expense_date,account_subject_id', limit: BASE_LIMIT }
        )) as {
          amount?: number
          category?: string
          trans_date?: string
          expense_date?: string
          account_subject_id?: number | null
        }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            const amt = Math.abs(Number(r.amount) || 0)
            bankWithdrawExpense += amt
            addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, true)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }
    beginningInventory = await getInventoryValue('본사', startStr, true, itemCostMap)
    endingInventory = await getInventoryValue('본사', endStr, false, itemCostMap)
    purchaseByVendor = Object.entries(purchaseVendorMapHq)
      .filter(([, v]) => v > 0)
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount)
  } else {
    const posFilter =
      `created_at=gte.${dayStartUtcIso}&created_at=lt.${nextDayStartUtcIso}` +
      (storeFilter !== 'All' ? `&${buildPosStoreCodeFilterFragment(storeFilter)}` : '')
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
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const [orders, hqVendorCodes, hqOutboundPurchaseSubtotal] = await Promise.all([
      supabaseSelectFilter('orders', orderFilter, {
        select: 'total',
        limit: BASE_LIMIT,
      }) as Promise<{ total?: number }[] | null>,
      loadHqVendorCodeNormSet(),
      sumHqOutboundPurchaseFromOffice(
        storeFilter === 'All' ? null : storeFilter,
        startStr,
        endStr,
        itemCostMap
      ),
    ])
    let ordersApprovedSubtotal = 0
    for (const o of orders || []) ordersApprovedSubtotal += Number(o.total) || 0
    limits.orders_purchase = { fetched: orders?.length || 0, limit: BASE_LIMIT }
    try {
      const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
      const obFilter = buildHqOutboundFromOfficeFilter(
        storeFilter === 'All' ? null : storeFilter,
        dayStartUtcIso,
        nextDayStartUtcIso
      )
      const obCount = await supabaseCountFilter('stock_logs', obFilter)
      limits.hq_outbound = { fetched: obCount, limit: BASE_LIMIT }
    } catch {
      limits.hq_outbound = { fetched: 0, limit: BASE_LIMIT }
    }

    ordersPurchaseSubtotal = hqOutboundPurchaseSubtotal
    purchaseHqOutboundBasis = {
      outboundTotal: hqOutboundPurchaseSubtotal,
      approvedOrdersTotal: ordersApprovedSubtotal,
      diff: round2(hqOutboundPurchaseSubtotal - ordersApprovedSubtotal),
    }

    const inboundByVendorStore =
      storeFilter !== 'All'
        ? await getDirectInboundPurchasesByVendor(storeFilter, startStr, endStr, itemCostMap, false)
        : await getDirectInboundPurchasesByVendor(null, startStr, endStr, itemCostMap, true)
    const bankPayByVendorRaw = await fetchBankPurchasePaymentsByVendor({
      isHQ: false,
      storeFilter,
      startStr,
      endStr,
    })
    const bankPayByVendorStore: Record<string, number> = {}
    for (const [k, v] of Object.entries(bankPayByVendorRaw)) {
      const amt = Number(v) || 0
      if (amt <= 0) continue
      const norm = String(k).trim().toLowerCase()
      if (hqVendorCodes.has(norm)) {
        excludedHqBankPaymentsRaw.push({ key: k, amount: amt })
        continue
      }
      bankPayByVendorStore[k] = amt
    }
    const purchaseVendorMapStore: Record<string, number> = { ...inboundByVendorStore }
    mergeVendorAmountMap(purchaseVendorMapStore, bankPayByVendorStore)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorStore,
      bankPayByVendorStore
    )
    /** 본사 창고 출고 + 거래처별(직접입고 + 통장 매입지급, 본사 법인 제외) — 펼침 합계와 매입 총액 일치 */
    const purchaseVendorDetailTotal = Object.values(purchaseVendorMapStore).reduce((a, b) => a + b, 0)
    purchases += ordersPurchaseSubtotal + purchaseVendorDetailTotal

    let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
    if (storeFilter !== 'All') {
      pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
    }
    const pettyRows = (await supabaseSelectFilter('petty_cash_transactions', pettyFilter, {
      select: 'amount,trans_type,account_subject_id',
      limit: BASE_LIMIT,
    })) as { amount?: number; trans_type?: string; account_subject_id?: number | null }[] | null
    for (const r of pettyRows || []) {
      if ((r.trans_type || '').toLowerCase() !== 'expense') continue
      const amt = Math.abs(Number(r.amount) || 0)
      pettyCashExpense += amt
      addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
    }
    limits.petty_cash = { fetched: pettyRows?.length || 0, limit: BASE_LIMIT }

    try {
      const bankAccRows = storeFilter !== 'All'
        ? ((await supabaseSelectFilter(
            'bank_accounts',
            buildStoreFieldOrIlikeFragment('store', storeFilter),
            { select: 'id', limit: 2000 }
          )) as { id?: number }[] | null)
        : ((await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null)
      const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
      if (accountIds.length > 0) {
        const idList = accountIds.join(',')
        const btRows = (await supabaseSelectFilter(
          'bank_transactions',
          `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw`,
          { select: 'amount,category,trans_date,expense_date,account_subject_id', limit: BASE_LIMIT }
        )) as {
          amount?: number
          category?: string
          trans_date?: string
          expense_date?: string
          account_subject_id?: number | null
        }[] | null
        for (const r of btRows || []) {
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const expDate = r.expense_date ? String(r.expense_date).slice(0, 10) : null
          const transDate = String(r.trans_date || '').slice(0, 10)
          const inRange = (d: string) => d >= startStr && d <= endStr
          if ((expDate && inRange(expDate)) || (!expDate && inRange(transDate))) {
            const amt = Math.abs(Number(r.amount) || 0)
            bankWithdrawExpense += amt
            addToSubjectMap(expenseBySubjectMap, r.account_subject_id, amt)
          }
        }
        limits.bank_withdraw = { fetched: btRows?.length || 0, limit: BASE_LIMIT }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, false)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }

    if (storeFilter !== 'All') {
      beginningInventory = await getInventoryValue(storeFilter, startStr, true, itemCostMap)
      endingInventory = await getInventoryValue(storeFilter, endStr, false, itemCostMap)
    } else {
      beginningInventory = await getInventoryValue(null, startStr, true, itemCostMap, true)
      endingInventory = await getInventoryValue(null, endStr, false, itemCostMap, true)
    }

    purchaseByVendor = []
    if (ordersPurchaseSubtotal > 0) {
      purchaseByVendor.push({ key: '__pl_hq_orders__', amount: ordersPurchaseSubtotal })
    }
    for (const [key, amount] of Object.entries(purchaseVendorMapStore)) {
      if (amount > 0) purchaseByVendor.push({ key, amount })
    }
    purchaseByVendor.sort((a, b) => b.amount - a.amount)
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

  const subjectMeta = await loadAccountSubjectMeta()
  const expenseByAccountSubject = buildExpenseByAccountList(expenseBySubjectMap, subjectMeta)

  const vendorNormToName = await loadVendorCodeNormToNameMap()
  purchaseByVendor = enrichPurchaseByVendorLabels(purchaseByVendor, vendorNormToName)
  if (excludedHqBankPaymentsRaw.length > 0) {
    purchaseExcludedHqBankPayments = excludedHqBankPaymentsRaw.map(({ key, amount }) => ({
      key,
      amount: round2(amount),
      label: vendorNormToName[key.toLowerCase()],
    }))
  }

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
    expenseByAccountSubject,
    purchaseByVendor,
    salesByCustomer,
    diagnostics:
      input.includeDebug ||
      purchaseInboundBankOverlapVendorKeys.length > 0 ||
      purchaseHqOutboundBasis != null ||
      (purchaseExcludedHqBankPayments?.length ?? 0) > 0
        ? {
            warnings: input.includeDebug ? warnings : [],
            limits: input.includeDebug ? limits : {},
            ...(purchaseInboundBankOverlapVendorKeys.length > 0
              ? { purchaseInboundBankOverlapVendorKeys }
              : {}),
            ...(purchaseHqOutboundBasis ? { purchaseHqOutboundBasis } : {}),
            ...(purchaseExcludedHqBankPayments?.length ? { purchaseExcludedHqBankPayments } : {}),
          }
        : undefined,
  }
}

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
  truncated: { inbound: boolean; bank: boolean; orders: boolean }
}

function drillVendorMatchesInboundRow(vendorKey: string, vendorTarget: string | null | undefined): boolean {
  const raw = String(vendorTarget || '').trim()
  if (vendorKey === '__pl_vendor_unknown__') return !raw
  return raw === String(vendorKey || '').trim()
}

function drillVendorMatchesBankRow(vendorKey: string, vendorCode: string | null | undefined): boolean {
  const raw = String(vendorCode || '').trim()
  if (vendorKey === '__pl_vendor_unknown__') return !raw
  return raw === String(vendorKey || '').trim()
}

async function loadItemCostMapForDrill(): Promise<Record<string, number>> {
  const itemRows = (await supabaseSelect('items', { limit: 50000, select: 'code,cost' })) as { code?: string; cost?: number }[] | null
  const itemCostMap: Record<string, number> = {}
  for (const r of itemRows || []) {
    const code = String(r.code || '').trim()
    if (code) itemCostMap[code] = Number(r.cost) || 0
  }
  return itemCostMap
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
    truncated: { inbound: false, bank: false, orders: false },
  }
  if (!vendorKey) return empty

  if (vendorKey === '__pl_hq_orders__') {
    if (isHQ) return { ...empty, isHqOrders: true }
    const itemCostMap = await loadItemCostMapForDrill()
    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
    const obFilter = buildHqOutboundFromOfficeFilter(
      storeFilter === 'All' ? null : storeFilter,
      dayStartUtcIso,
      nextDayStartUtcIso
    )
    const obRaw = (await supabaseSelectFilter('stock_logs', obFilter, {
      select: 'id,log_date,log_type,vendor_target,item_code,qty,invoice_unit_price',
      limit: BASE_LIMIT,
      order: 'log_date.desc',
    })) as {
      id?: number
      log_date?: string
      log_type?: string
      vendor_target?: string
      item_code?: string
      qty?: number
      invoice_unit_price?: number | null
    }[] | null
    const hqOutbounds: IncomeStatementPurchaseDrillHqOutboundRow[] = []
    for (const r of obRaw || []) {
      const qty = Math.abs(Number(r.qty) || 0)
      const code = String(r.item_code || '').trim()
      const unit =
        r.invoice_unit_price != null && !isNaN(Number(r.invoice_unit_price))
          ? Number(r.invoice_unit_price)
          : (itemCostMap[code] ?? 0)
      const lineAmount = round2(qty * unit)
      if (!qty && !lineAmount) continue
      const id = Number(r.id)
      if (!id) continue
      hqOutbounds.push({
        kind: 'hq_outbound',
        id,
        logDate: String(r.log_date || '').slice(0, 10),
        logType: r.log_type != null ? String(r.log_type) : null,
        itemCode: code,
        targetStore: r.vendor_target != null ? String(r.vendor_target).trim() || null : null,
        qty,
        unitPrice: unit,
        lineAmount,
      })
    }
    const obTruncated = hqOutbounds.length > PURCHASE_DRILL_LIMIT
    const hqOutboundsSlice = obTruncated ? hqOutbounds.slice(0, PURCHASE_DRILL_LIMIT) : hqOutbounds

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const orders = (await supabaseSelectFilter('orders', orderFilter, {
      select: 'id,order_date,total,store_name,status',
      limit: BASE_LIMIT,
      order: 'order_date.desc',
    })) as { id?: number; order_date?: string; total?: number; store_name?: string; status?: string }[] | null
    const hqOrders: IncomeStatementPurchaseDrillOrderRow[] = []
    for (const o of orders || []) {
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
    const ordTruncated = hqOrders.length > PURCHASE_DRILL_LIMIT
    const hqOrdersSlice = ordTruncated ? hqOrders.slice(0, PURCHASE_DRILL_LIMIT) : hqOrders

    return {
      ...empty,
      isHqOrders: true,
      hqOutbounds: hqOutboundsSlice,
      hqOrders: hqOrdersSlice,
      truncated: { ...empty.truncated, orders: obTruncated || ordTruncated },
    }
  }

  const itemCostMap = await loadItemCostMapForDrill()
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  let inboundFilter = `log_type=eq.Inbound&log_date=gte.${dayStartUtcIso}&log_date=lt.${nextDayStartUtcIso}`
  if (isHQ) {
    inboundFilter += `&${buildStoreFieldOrIlikeFragment('location', '입고등록')}`
  } else if (storeFilter !== 'All') {
    inboundFilter += `&${buildStoreFieldOrIlikeFragment('location', storeFilter)}`
  }
  const inboundRaw = (await supabaseSelectFilter('stock_logs', inboundFilter, {
    select: 'id,log_date,location,item_code,qty,unit_cost,vendor_target',
    limit: BASE_LIMIT,
    order: 'log_date.desc',
  })) as {
    id?: number
    log_date?: string
    location?: string
    item_code?: string
    qty?: number
    unit_cost?: number | null
    vendor_target?: string
  }[] | null

  const excludeHqInbound = !isHQ && storeFilter === 'All'
  const inboundAcc: IncomeStatementPurchaseDrillInboundRow[] = []
  for (const r of inboundRaw || []) {
    if (String(r.vendor_target || '').trim() === 'From HQ') continue
    if (excludeHqInbound && (r.location === '입고등록' || isOfficeStore(String(r.location || '')))) continue
    if (!drillVendorMatchesInboundRow(vendorKey, r.vendor_target)) continue
    const code = String(r.item_code || '').trim()
    if (!code) continue
    const qty = Number(r.qty) || 0
    const unitCost =
      r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : (itemCostMap[code] ?? 0)
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
      vendorTarget: r.vendor_target != null ? String(r.vendor_target).trim() || null : null,
    })
  }
  const inboundTruncated = inboundAcc.length > PURCHASE_DRILL_LIMIT
  const inbound = inboundTruncated ? inboundAcc.slice(0, PURCHASE_DRILL_LIMIT) : inboundAcc

  let accountIds: number[] = []
  try {
    if (isHQ) {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as
        | { id?: number; store?: string }[]
        | null
      accountIds = (bankAccRows || [])
        .filter((a) => isOfficeStore(String(a.store || '')) || String(a.store || '').startsWith('Office-'))
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
  if (accountIds.length > 0) {
    const idList = accountIds.join(',')
    let btRows: {
      id?: number
      trans_date?: string
      amount?: number
      vendor_code?: string
      memo?: string | null
      note?: string | null
      store?: string | null
      ref_type?: string | null
      ref_id?: number | null
    }[] | null
    try {
      btRows = (await supabaseSelectFilter(
        'bank_transactions',
        `account_id=in.(${idList})&trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.withdraw&category=eq.purchase_payment`,
        { select: 'id,trans_date,amount,vendor_code,memo,note,store,ref_type,ref_id', limit: BASE_LIMIT, order: 'trans_date.desc' }
      )) as typeof btRows
    } catch {
      btRows = null
    }
    for (const r of btRows || []) {
      if (storeFilter !== 'All') {
        const bts = String(r.store || '').trim()
        if (isHQ) {
          if (bts && !isOfficeStore(bts) && !bts.startsWith('Office-')) continue
        } else {
          if (bts && !storeMatchesIncomeFilter(bts, storeFilter)) continue
        }
      }
      if (!drillVendorMatchesBankRow(vendorKey, r.vendor_code)) continue
      const id = Number(r.id)
      if (!id) continue
      const rid = r.ref_id != null && !isNaN(Number(r.ref_id)) ? Number(r.ref_id) : null
      bankAcc.push({
        kind: 'bank',
        id,
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount) || 0),
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
    truncated: { inbound: inboundTruncated, bank: bankTruncated, orders: false },
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
      bankAccounts =
        ((await supabaseSelectFilter(
          'bank_accounts',
          `store=ilike.${encodeURIComponent(sqlIlikeContains(storeFilter))}`,
          { select: 'id,store,opening_balance', limit: 2000 }
        )) as { id?: number; store?: string; opening_balance?: number }[] | null) || []
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
    const receivableFilter =
      storeFilter !== 'All' && !isHQ
        ? buildStoreFieldOrIlikeFragment('store_name', storeFilter)
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

