/** 손익계산서 매입 상세 → 출고/발주/통장/입고 화면 딥링크 (기간·매장·거래처 조건 전달) */

export const PL_DRILL_QUERY_FLAG = 'plDrill'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type PurchaseDrillNavContext = {
  startStr: string
  endStr: string
  yearMonth: string
  storeFilter: string
  vendorKey: string
  isHqOrders: boolean
  /** 입고 거래처명 필터용 (표시명) */
  vendorLabel?: string
}

export type ParsedPurchaseDrillNav = {
  fromPlDrill: boolean
  startStr?: string
  endStr?: string
  yearMonth?: string
  store?: string
  vendorKey?: string
  vendorLabel?: string
  isHqOrders?: boolean
  orderStatus?: string
  filterTransType?: string
  filterCategory?: string
  filterVendorCode?: string
  /** 손익 비용 드릴다운 — 계정과목 id (미지정은 unclassified) */
  filterAccountSubjectId?: string
  filterAccountSubjectUnclassified?: boolean
  /** 손익 비용 드릴다운 — 통장 출금 중 이체·대출 등 제외(손익 집계와 동일) */
  filterPlExpenseOnly?: boolean
  /** 패티 목록 — trans_type (예: expense) */
  filterPettyTransType?: string
}

/** 손익 비용 상세 API·드릴다운용 — 계정 미지정 행 */
export const PL_EXPENSE_UNCLASSIFIED_SUBJECT = '__unclassified__'

function readDate(sp: URLSearchParams, key: string): string | undefined {
  const v = sp.get(key)?.trim() ?? ''
  return DATE_RE.test(v) ? v : undefined
}

export function parsePurchaseDrillNav(searchParams: URLSearchParams): ParsedPurchaseDrillNav {
  if (searchParams.get(PL_DRILL_QUERY_FLAG) !== '1') {
    return { fromPlDrill: false }
  }
  const startStr = readDate(searchParams, 'startStr')
  const endStr = readDate(searchParams, 'endStr')
  const yearMonthRaw = searchParams.get('yearMonth')?.trim() ?? ''
  const yearMonth = /^\d{4}-\d{2}$/.test(yearMonthRaw) ? yearMonthRaw : undefined
  const store = searchParams.get('store')?.trim() || undefined
  const vendorKey = searchParams.get('vendorKey')?.trim() || undefined
  const vendorLabel = searchParams.get('vendor')?.trim() || undefined
  const isHqOrders = searchParams.get('hqOrders') === '1'
  const orderStatus = searchParams.get('status')?.trim() || undefined
  const filterTransType = searchParams.get('filterTransType')?.trim() || undefined
  const filterCategory = searchParams.get('filterCategory')?.trim() || undefined
  const filterVendorCode = searchParams.get('filterVendorCode')?.trim() || undefined
  const filterAccountSubjectId = searchParams.get('filterAccountSubjectId')?.trim() || undefined
  const filterAccountSubjectUnclassified = searchParams.get('filterAccountSubjectUnclassified') === '1'
  const filterPlExpenseOnly = searchParams.get('filterPlExpenseOnly') === '1'
  const filterPettyTransType = searchParams.get('filterPettyTransType')?.trim() || undefined
  return {
    fromPlDrill: true,
    startStr,
    endStr,
    yearMonth,
    store,
    vendorKey,
    vendorLabel,
    isHqOrders,
    orderStatus,
    filterTransType,
    filterCategory,
    filterVendorCode,
    filterAccountSubjectId,
    filterAccountSubjectUnclassified,
    filterPlExpenseOnly,
    filterPettyTransType,
  }
}

export function buildPurchaseDrillAdminHref(
  path: string,
  ctx: PurchaseDrillNavContext,
  target: 'outbound' | 'orders' | 'bank' | 'inbound'
): string {
  const q = new URLSearchParams()
  q.set(PL_DRILL_QUERY_FLAG, '1')
  if (DATE_RE.test(ctx.startStr)) q.set('startStr', ctx.startStr)
  if (DATE_RE.test(ctx.endStr)) q.set('endStr', ctx.endStr)
  if (/^\d{4}-\d{2}$/.test(ctx.yearMonth)) q.set('yearMonth', ctx.yearMonth)
  const store = ctx.storeFilter && ctx.storeFilter !== 'All' ? ctx.storeFilter.trim() : ''
  if (store) q.set('store', store)
  const vk = ctx.vendorKey.trim()
  if (vk && vk !== '__pl_hq_orders__') q.set('vendorKey', vk)
  const vl = String(ctx.vendorLabel || '').trim()
  if (vl && vk !== '__pl_hq_orders__' && vk !== '__pl_vendor_unknown__') {
    q.set('vendor', vl)
  }
  if (ctx.isHqOrders) q.set('hqOrders', '1')

  switch (target) {
    case 'outbound':
      q.set('tab', 'hist')
      break
    case 'orders':
      if (ctx.isHqOrders) q.set('status', 'approved')
      break
    case 'bank':
      q.set('tab', 'query')
      q.set('filterTransType', 'withdraw')
      q.set('filterCategory', 'purchase_payment')
      if (vk && vk !== '__pl_hq_orders__' && vk !== '__pl_vendor_unknown__') {
        q.set('filterVendorCode', vk)
      }
      break
    case 'inbound':
      q.set('tab', 'hist')
      break
  }

  const qs = q.toString()
  return qs ? `${path}?${qs}` : path
}

export function purchaseDrillNavContextFromDrill(
  drill: Pick<
    PurchaseDrillNavContext,
    'startStr' | 'endStr' | 'yearMonth' | 'storeFilter' | 'vendorKey' | 'isHqOrders'
  >,
  vendorLabel?: string
): PurchaseDrillNavContext {
  return {
    startStr: drill.startStr,
    endStr: drill.endStr,
    yearMonth: drill.yearMonth,
    storeFilter: drill.storeFilter,
    vendorKey: drill.vendorKey,
    isHqOrders: drill.isHqOrders,
    vendorLabel,
  }
}

export type ExpenseDrillNavContext = {
  startStr: string
  endStr: string
  yearMonth: string
  storeFilter: string
  accountSubjectKey: string
  accountSubjectId: number | null
}

export function expenseDrillNavContextFromDrill(
  drill: Pick<ExpenseDrillNavContext, 'startStr' | 'endStr' | 'yearMonth' | 'storeFilter' | 'accountSubjectKey' | 'accountSubjectId'>
): ExpenseDrillNavContext {
  return {
    startStr: drill.startStr,
    endStr: drill.endStr,
    yearMonth: drill.yearMonth,
    storeFilter: drill.storeFilter,
    accountSubjectKey: drill.accountSubjectKey,
    accountSubjectId: drill.accountSubjectId,
  }
}

export function buildExpenseDrillAdminHref(
  path: string,
  ctx: ExpenseDrillNavContext,
  target: 'bank' | 'petty'
): string {
  const q = new URLSearchParams()
  q.set(PL_DRILL_QUERY_FLAG, '1')
  if (DATE_RE.test(ctx.startStr)) q.set('startStr', ctx.startStr)
  if (DATE_RE.test(ctx.endStr)) q.set('endStr', ctx.endStr)
  if (/^\d{4}-\d{2}$/.test(ctx.yearMonth)) q.set('yearMonth', ctx.yearMonth)
  const store = ctx.storeFilter && ctx.storeFilter !== 'All' ? ctx.storeFilter.trim() : ''
  if (store) q.set('store', store)
  if (ctx.accountSubjectId == null) {
    q.set('filterAccountSubjectUnclassified', '1')
  } else {
    q.set('filterAccountSubjectId', String(ctx.accountSubjectId))
  }
  switch (target) {
    case 'bank':
      q.set('tab', 'query')
      q.set('filterTransType', 'withdraw')
      q.set('filterPlExpenseOnly', '1')
      break
    case 'petty':
      q.set('filterPettyTransType', 'expense')
      break
  }
  const qs = q.toString()
  return qs ? `${path}?${qs}` : path
}
