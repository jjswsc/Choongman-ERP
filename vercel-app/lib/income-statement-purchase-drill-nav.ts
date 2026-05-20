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
}

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
