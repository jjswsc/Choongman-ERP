/** 경영 손익 분석 → 관련 화면 deep link (기간·매장 프리셋) */

export function buildSalesManagementDrillUrl(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  menu?: string
  topic?: string
  orderTypes?: string
}): string {
  const q = new URLSearchParams()
  q.set('menu', params.menu ?? 'sales-discount')
  q.set('topic', params.topic ?? 'report-discount-all')
  q.set('group', 'month')
  q.set('start', params.startStr)
  q.set('end', params.endStr)
  const store = String(params.storeFilter ?? '').trim()
  if (store && store !== 'All') q.set('stores', store)
  if (params.orderTypes) q.set('orderTypes', params.orderTypes)
  return `/admin/sales-management?${q.toString()}`
}

export function buildFinancialStatementsDrillUrl(params: {
  yearMonthStart: string
  yearMonthEnd: string
  storeFilter?: string
  tab?: 'income' | 'margin'
}): string {
  const q = new URLSearchParams()
  q.set('tab', params.tab ?? 'income')
  q.set('ymStart', params.yearMonthStart)
  q.set('ymEnd', params.yearMonthEnd)
  const store = String(params.storeFilter ?? '').trim()
  if (store && store !== 'All') q.set('store', store)
  return `/admin/financial-statements?${q.toString()}`
}

export function channelToOrderTypesParam(channel: 'dine_in' | 'takeout' | 'delivery' | 'other'): string | undefined {
  if (channel === 'dine_in') return 'dine_in'
  if (channel === 'takeout') return 'takeout'
  if (channel === 'delivery') return 'delivery'
  return undefined
}
