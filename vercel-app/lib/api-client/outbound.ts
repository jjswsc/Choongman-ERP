/**
 * 출고 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface OutboundHistoryItem {
  outboundLocation?: string
  date: string
  target: string
  type: 'Force' | 'Outbound'
  name: string
  code: string
  spec: string
  qty: number
  amount: number
  orderRowId?: string
  deliveryStatus?: string
  deliveryDate?: string
  orderDate?: string
  invoiceNo?: string
  receiveImageUrl?: string
  receiveImageUrls?: string[]
  receivedIndices?: number[]
  originalOrderQty?: number
  /** 수량 변경 이력 [원본, 승인후?, 수령후] - 3단계 표기용 */
  qtyStages?: number[]
  totalOrderItems?: number
  /** 미수령 품목 여부 (부분 배송 시 누락 품목) */
  isUnreceived?: boolean
  /** stock_logs.id — 출고 로그 단가 수정용 */
  stockLogId?: number
  /** 주문 cart line_remarks — 송장 품목 하단 */
  lineRemarks?: string
}

export type DeleteOutboundPreview = {
  success: boolean
  dryRun?: boolean
  targetCount?: number
  mode?: 'order' | 'force'
  orderId?: number
  referenceNo?: string
  orderIds?: number[]
  forceOutboundIds?: number[]
  stores?: string[]
  restoreByLocation?: Record<string, number>
  receivableDeleteByStore?: Record<string, number>
  projectedOutstandingByStore?: Record<string, number>
  /** 출고 로그 없이 승인만 된 주문 — 반려 취소 경로 */
  orderCancelWithoutOutboundLogs?: boolean
  conflicts?: { kind: 'journal_exists' | 'over_receive'; message: string; store?: string; orderId?: number }[]
  message?: string
}

export async function previewDeleteOutbound(params: {
  mode: 'order' | 'force'
  orderId?: number
  referenceNo?: string
  stockLogIds?: number[]
}) {
  const res = await apiFetchWithOffline('/api/deleteOutbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: params.mode,
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.referenceNo ? { referenceNo: params.referenceNo } : {}),
      ...(params.stockLogIds?.length ? { stockLogIds: params.stockLogIds } : {}),
      dryRun: true,
    }),
  })
  return res.json() as Promise<DeleteOutboundPreview>
}

export async function deleteOutbound(params: {
  mode: 'order' | 'force'
  reason: string
  orderId?: number
  referenceNo?: string
  stockLogIds?: number[]
  idempotencyKey?: string
}) {
  const res = await apiFetchWithOffline('/api/deleteOutbound', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(params.idempotencyKey ? { 'x-idempotency-key': params.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      mode: params.mode,
      reason: params.reason,
      ...(params.orderId ? { orderId: params.orderId } : {}),
      ...(params.referenceNo ? { referenceNo: params.referenceNo } : {}),
      ...(params.stockLogIds?.length ? { stockLogIds: params.stockLogIds } : {}),
      ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    }),
  })
  return res.json() as Promise<{
    success: boolean
    duplicated?: boolean
    message?: string
    deletedCount?: number
    orderCancelWithoutOutboundLogs?: boolean
    warnings?: string[]
    preview?: DeleteOutboundPreview
    conflicts?: { kind: 'journal_exists' | 'over_receive'; message: string; store?: string; orderId?: number }[]
  }>
}

export async function forceOutboundBatch(
  list: {
    date?: string
    deliveryDate?: string
    store: string
    code: string
    name?: string
    spec?: string
    qty: number | string
  }[],
  options?: { processorName?: string; referenceNo?: string }
) {
  const ref = String(options?.referenceNo ?? '').trim()
  const useObj = Boolean(options?.processorName) || ref.length > 0
  const payload = useObj
    ? {
        list,
        ...(options?.processorName ? { processorName: options.processorName } : {}),
        ...(ref ? { referenceNo: ref } : {}),
      }
    : list
  const res = await apiFetchWithOffline('/api/forceOutboundBatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 강제출고 수령 완료 처리 */
export async function updateForceOutboundReceived(params: { date: string; vendorTarget: string }) {
  const res = await apiFetchWithOffline('/api/updateForceOutboundReceived', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: params.date, vendorTarget: params.vendorTarget }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getCombinedOutboundHistory(params: {
  startStr: string
  endStr: string
  vendorFilter?: string
  typeFilter?: string
  /** 출고 로그 품목코드·품목명 부분 검색 */
  itemSearch?: string
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
  if (params.typeFilter) q.set('typeFilter', params.typeFilter)
  if (params.itemSearch?.trim()) q.set('itemSearch', params.itemSearch.trim())
  const res = await apiFetchWithOffline(`/api/getCombinedOutboundHistory?${q}`)
  return jsonAsArray<OutboundHistoryItem>(await res.json())
}

export type OutboundStoreMonthAmountCell = {
  subtotal: number
  vat: number
  grandTotal: number
  salesTotal: number
  purchaseToSalesPct: number | null
}

export type OutboundStoreMonthMatrixResult = {
  year: number
  month: number | null
  months: string[]
  stores: string[]
  cells: Record<string, Record<string, OutboundStoreMonthAmountCell>>
  rowTotals: Record<string, OutboundStoreMonthAmountCell>
  colTotals: Record<string, OutboundStoreMonthAmountCell>
  grandTotal: OutboundStoreMonthAmountCell
  hitRowCap: boolean
  lineCount: number
  salesLoaded: boolean
}

/** 출고 관리 — 매장×월별 금액 행렬 (공급가·VAT·합계, stock_logs 기준) */
export async function getOutboundStoreMonthMatrix(params: {
  year: number
  /** 1–12, 생략 또는 null = 연간 전체 */
  month?: number | null
  storeFilter?: string
  knownStores?: string[]
}) {
  const q = new URLSearchParams({ year: String(params.year) })
  if (params.month != null && params.month >= 1 && params.month <= 12) {
    q.set('month', String(params.month))
  }
  if (params.storeFilter?.trim()) q.set('storeFilter', params.storeFilter.trim())
  if (params.knownStores?.length) q.set('knownStores', params.knownStores.join(','))
  const res = await apiFetchWithOffline(`/api/getOutboundStoreMonthMatrix?${q}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<OutboundStoreMonthMatrixResult>
}

export type HqWarehouseMovementColumn = {
  key: string
  ymd: string
  kind: 'in' | 'out' | 'adjust'
  store?: string
  label: string
}

export type HqWarehouseDailyItemRow = {
  code: string
  name: string
  spec: string
  unit: string
  cost: number
  price: number
  category: string
  cells: Record<string, number>
  beginning: number
  balance: number
  minQty: number
  totalIn: number
  totalOut: number
  avgOutPerDay: number
  avgOutPerWeek: number
  avgOutPerMonth: number
  orderPeriodDays: number | null
  costOfGoods: number
  valuationUnitCost: number
  priorTotalOut: number
  outChangePct: number | null
  sparkline: number[]
}

export type HqWarehouseDailyStockMatrixResult = {
  startStr: string
  endStr: string
  warehouseKey: string
  warehouseLabel: string
  warehouseOptions: string[]
  columns: HqWarehouseMovementColumn[]
  items: HqWarehouseDailyItemRow[]
  dayInvoices: HqWarehouseDayInvoice[]
  stores: string[]
  periodDays: number
  hitRowCap: boolean
  usedRpc: boolean
  priorStartStr?: string
  priorEndStr?: string
}

export type HqWarehouseDayInvoice = {
  ymd: string
  store: string
  invoiceNo: string
  type: 'Outbound' | 'Force'
  orderId?: number
  stockLogId?: number
  subtotal: number
  vat: number
  grandTotal: number
}

/** 본사 창고 일별 입·출고 매트릭스 (Daily Stock Report) */
export async function getHqWarehouseDailyStockMatrix(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  categoryFilter?: string
  warehouseKey?: string
  includePriorPeriod?: boolean
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter?.trim()) q.set('storeFilter', params.storeFilter.trim())
  if (params.categoryFilter?.trim()) q.set('categoryFilter', params.categoryFilter.trim())
  if (params.warehouseKey?.trim()) q.set('warehouseKey', params.warehouseKey.trim())
  if (params.includePriorPeriod === false) q.set('includePriorPeriod', '0')
  const res = await apiFetchWithOffline(`/api/getHqWarehouseDailyStockMatrix?${q}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<HqWarehouseDailyStockMatrixResult>
}

/** 출고 로그(stock_logs) 확정 단가·수량 수정 — 본사 권한, orders 미변경 */
export async function patchStockLogInvoiceUnitPrice(params: {
  stockLogId: number
  invoiceUnitPrice: number
  /** 절대수량(양수). 지정 시 stock_logs.qty 갱신(부호는 기존 행 유지) */
  qtyAbs?: number
}) {
  const res = await apiFetchWithOffline('/api/patchStockLogInvoiceUnitPrice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stockLogId: params.stockLogId,
      invoiceUnitPrice: params.invoiceUnitPrice,
      ...(params.qtyAbs != null ? { qtyAbs: params.qtyAbs } : {}),
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    receivableSync?: { ran: boolean; ok?: boolean; message?: string }
  }>
}

/** 주문 수령 사진 온디맨드 조회 (출고 내역에서 사진 클릭 시) */
export async function getOrderReceivePhoto(orderId: string) {
  const res = await apiFetchWithOffline(`/api/getOrderReceivePhoto?orderId=${encodeURIComponent(orderId)}`)
  const data = (await res.json()) as { urls?: string[] }
  return { urls: data.urls ?? [] }
}

/** e-Tax 인보이스 XML 생성 */
export interface EtaxGroupInput {
  date: string
  target: string
  type: string
  orderRowId?: string
  invoiceNo?: string
  items: { name: string; code?: string; spec?: string; qty: number; amount: number }[]
  totalAmt: number
}

export async function generateEtaxXmlApi(groups: EtaxGroupInput[], sign = false) {
  const res = await apiFetchWithOffline('/api/generateEtaxXml', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groups, sign }),
  })
  return res.json() as Promise<{
    success?: boolean
    error?: string
    count?: number
    results?: { refKey: string; invoiceNo: string }[]
    xml?: string | null
    xmls?: { refKey: string; invoiceNo: string; xml: string }[]
  }>
}

export interface WarehouseOutboundRow {
  store: string
  code: string
  name: string
  spec: string
  qty: number
  deliveryDate: string
  source: 'Order' | 'Force'
}

export interface GetOutboundByWarehouseResult {
  byWarehouse: Record<string, WarehouseOutboundRow[]>
  warehouseOrder: string[]
  period: { start: string; end: string }
  filterBy: 'order' | 'delivery'
}

export async function getOutboundByWarehouse(params: {
  startStr: string
  endStr: string
  filterBy?: 'order' | 'delivery'
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.filterBy) q.set('filterBy', params.filterBy)
  const res = await apiFetchWithOffline(`/api/getOutboundByWarehouse?${q}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<GetOutboundByWarehouseResult>
}

export interface InvoiceDataCompany {
  companyName: string
  address: string
  taxId: string
  phone: string
  bankInfo: string
  projectName?: string
}

export interface InvoiceDataClient {
  companyName: string
  address: string
  taxId: string
  phone: string
}

export async function getInvoiceData() {
  const res = await apiFetchWithOffline('/api/getInvoiceData')
  return res.json() as Promise<{ company: InvoiceDataCompany; clients: Record<string, InvoiceDataClient> }>
}

/** 출고 인보이스: 주문별 BILL TO 매칭용 후보 문자열(store_name + cart vendor) */
export async function getInvoiceOrderBillToCandidates(orderIds: number[]) {
  const res = await apiFetchWithOffline('/api/getInvoiceOrderBillToCandidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  })
  return res.json() as Promise<{
    map: Record<string, string[]>
    taxInvoiceClientMap: Record<string, InvoiceDataClient>
  }>
}

export type InvoiceSettings = Record<string, string>

export async function getInvoiceSettings() {
  const res = await apiFetchWithOffline('/api/getInvoiceSettings')
  return res.json() as Promise<InvoiceSettings>
}

export async function updateInvoiceSettings(settings: InvoiceSettings) {
  const res = await apiFetchWithOffline('/api/updateInvoiceSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type InvoicePrintOverrideRef = {
  refType: string
  refId: number
  docKind?: "invoice" | "tax"
}

export type InvoicePrintOverridePayload = InvoicePrintOverrideRef & {
  issueDate?: string
  dueDate?: string
  referenceNo?: string
  documentNo?: string
  shipTo?: string
}

export async function getInvoicePrintOverrides(refs: InvoicePrintOverrideRef[]) {
  const res = await apiFetchWithOffline('/api/getInvoicePrintOverrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refs }),
  })
  return res.json() as Promise<{
    success: boolean
    map: Record<
      string,
      {
        issueDate?: string
        dueDate?: string
        referenceNo?: string
        documentNo?: string
        shipTo?: string
        updatedAt?: string
      }
    >
    message?: string
  }>
}

export async function updateInvoicePrintOverrides(items: InvoicePrintOverridePayload[]) {
  const res = await apiFetchWithOffline('/api/updateInvoicePrintOverrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  return res.json() as Promise<{ success: boolean; saved?: number; message?: string }>
}
