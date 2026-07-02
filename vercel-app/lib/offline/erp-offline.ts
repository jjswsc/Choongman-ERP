/**
 * ERP 오프라인 캐시 - 1단계: 읽기 캐시
 * 온라인 시 API 호출 후 캐시 저장, 오프라인/API 실패 시 캐시 사용
 */

import { isOnline, reportNetworkSuccess, runReachabilityProbe, shouldPreferOfflineCache } from './network'
import { getFromErpCache, setErpCache, deleteErpCache, deleteErpCacheByPrefix } from './cache'
import { apiFetch } from '../api/fetch'

const CACHE_KEYS = {
  STORE_LIST: 'erp:storeList:v2',
  VENDORS_PURCHASE: 'erp:vendorsPurchase',
  VENDORS_SALES: 'erp:vendorsSales',
  CHECKLIST_ITEMS_ACTIVE: 'erp:checklistItems:active',
  CHECKLIST_ITEMS_ALL: 'erp:checklistItems:all',
} as const

export interface StoreListData {
  stores: string[]
  /** POS 터미널·본사 시연용 — test/HQ/Office 제외 전 dedupe 목록 */
  allStores?: string[]
  users: Record<string, string[]>
  staffByStore?: Record<string, { name: string; nick: string; job?: string; role?: string }[]>
  /** erp_stores 사용 시 code → 표시명 */
  storeLabels?: Record<string, string>
  /** 표기(소문자 정규화 키) → store_code */
  legacyToCanonical?: Record<string, string>
  usedMaster?: boolean
}

export async function getStoreListWithCache(): Promise<StoreListData> {
  const fallback: StoreListData = {
    stores: [],
    allStores: [],
    users: {},
    staffByStore: {},
    storeLabels: {},
    legacyToCanonical: {},
    usedMaster: false,
  }
  const readIdb = () => getFromErpCache<StoreListData>(CACHE_KEYS.STORE_LIST)
  const hasStoreData = (data: StoreListData | null | undefined) =>
    Array.isArray(data?.stores) && data.stores.length > 0

  if (!shouldPreferOfflineCache() && isOnline()) {
    try {
      const res = await apiFetch('/api/getStoreList')
      if (!res.ok) {
        const cached = await readIdb()
        return cached ?? fallback
      }
      const data = (await res.json()) as StoreListData
      const cached = await readIdb()
      if (!hasStoreData(data) && hasStoreData(cached)) return cached as StoreListData
      await setErpCache(CACHE_KEYS.STORE_LIST, data)
      return data
    } catch {
      const cached = await readIdb()
      return cached ?? fallback
    }
  }

  const fromIdb = await readIdb()
  if (fromIdb != null) return fromIdb
  try {
    const res = await apiFetch('/api/getStoreList')
    if (!res.ok) return fallback
    const data = (await res.json()) as StoreListData
    const cached = await readIdb()
    if (!hasStoreData(data) && hasStoreData(cached)) return cached as StoreListData
    await setErpCache(CACHE_KEYS.STORE_LIST, data)
    return data
  } catch {
    return fallback
  }
}

export type VendorForPurchase = {
  code: string
  name: string
  address?: string
  taxId?: string
  phone?: string
  bankAccountNo?: string | null
  /** 거래처 마스터 매출처(매장) — 회계 PO 매장별 거래처 필터용 */
  salesOutlet?: string | null
  gpsName?: string | null
}

export async function getVendorsForPurchaseWithCache(): Promise<VendorForPurchase[]> {
  const fallback: VendorForPurchase[] = []
  if (isOnline()) {
    try {
      const res = await apiFetch('/api/getVendorsForPurchase')
      const data = (await res.json()) as VendorForPurchase[]
      await setErpCache(CACHE_KEYS.VENDORS_PURCHASE, data)
      return data ?? fallback
    } catch {
      const cached = await getFromErpCache<VendorForPurchase[]>(CACHE_KEYS.VENDORS_PURCHASE)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<VendorForPurchase[]>(CACHE_KEYS.VENDORS_PURCHASE)
  return cached ?? fallback
}

export async function getVendorsForSalesWithCache(): Promise<{ code: string; name: string }[]> {
  const fallback: { code: string; name: string }[] = []
  if (isOnline()) {
    try {
      const res = await apiFetch('/api/getVendorsForSales')
      const data = (await res.json()) as { code: string; name: string }[]
      await setErpCache(CACHE_KEYS.VENDORS_SALES, data)
      return data ?? fallback
    } catch {
      const cached = await getFromErpCache<{ code: string; name: string }[]>(CACHE_KEYS.VENDORS_SALES)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<{ code: string; name: string }[]>(CACHE_KEYS.VENDORS_SALES)
  return cached ?? fallback
}

export type ChecklistItem = { id: number; main: string; sub: string; name: string; use?: boolean; sort_order?: number }

export async function getChecklistItemsWithCache(activeOnly: boolean): Promise<ChecklistItem[]> {
  const key = activeOnly ? CACHE_KEYS.CHECKLIST_ITEMS_ACTIVE : CACHE_KEYS.CHECKLIST_ITEMS_ALL
  const fallback: ChecklistItem[] = []
  if (isOnline()) {
    try {
      const q = new URLSearchParams({ activeOnly: String(activeOnly) })
      const res = await apiFetch(`/api/getChecklistItems?${q}`)
      const data = (await res.json()) as ChecklistItem[]
      await setErpCache(key, data)
      return data ?? fallback
    } catch {
      const cached = await getFromErpCache<ChecklistItem[]>(key)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<ChecklistItem[]>(key)
  return cached ?? fallback
}

/** 캐시 키 생성 - 파라미터 조합 */
function cacheKey(prefix: string, params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
  return `${prefix}:${parts.join(':')}`
}

/** 공통 패턴: 온라인 시 API 호출+캐시, 오프라인/실패 시 캐시 사용 */
async function fetchWithCache<T>(
  cacheKeyStr: string,
  fetcher: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (isOnline()) {
    try {
      const data = await fetcher()
      await setErpCache(cacheKeyStr, data)
      return data ?? fallback
    } catch {
      const cached = await getFromErpCache<T>(cacheKeyStr)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<T>(cacheKeyStr)
  return cached ?? fallback
}

// ─── 미수/미지급금 ───
export interface ReceivablePayableItem {
  storeName?: string
  vendorCode?: string
  vendorName?: string
  balance: number
  items: {
    id?: number
    trans_date?: string
    ref_type?: string
    ref_id?: number
    amount?: number
    memo?: string
    invoice_no?: string
    invoice_received?: boolean
    receive_checked?: boolean
    attributed_store?: string
  }[]
}

export async function getReceivablePayableListWithCache(params: {
  type: 'receivable' | 'payable'
  storeFilter?: string
  vendorFilter?: string
  startStr: string
  endStr: string
  userStore?: string
  userRole?: string
  /** true: SW·IDB 캐시 우회 후 네트워크 우선 (검색·저장 후 재조회) */
  fresh?: boolean
}): Promise<{ type: string; list: ReceivablePayableItem[] }> {
  const key = cacheKey('erp:recPay', {
    type: params.type,
    store: params.storeFilter || '',
    vendor: params.vendorFilter || '',
    start: params.startStr,
    end: params.endStr,
  })
  const fallback: { type: string; list: ReceivablePayableItem[] } = { type: params.type, list: [] }
  const fetcher = async () => {
    const q = new URLSearchParams({
      type: params.type,
      startStr: params.startStr,
      endStr: params.endStr,
    })
    if (params.storeFilter) q.set('storeFilter', params.storeFilter)
    if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
    if (params.userStore) q.set('userStore', params.userStore)
    if (params.userRole) q.set('userRole', params.userRole)
    if (params.fresh) q.set('_t', String(Date.now()))
    const res = await apiFetch(`/api/getReceivablePayableList?${q}`)
    return res.json() as Promise<{ type: string; list: ReceivablePayableItem[] }>
  }
  if (params.fresh) {
    try {
      const data = await fetcher()
      await setErpCache(key, data)
      return data ?? fallback
    } catch {
      return fallback
    }
  }
  return fetchWithCache(key, fetcher, fallback)
}

/** 미수/미지급 목록 캐시 무효화 (통장 거래 수정/삭제 후 즉시 재조회 반영용) */
export async function invalidateReceivablePayableListCache(): Promise<void> {
  await deleteErpCacheByPrefix('erp:recPay')
}

export interface PayableTransactionItem {
  code?: string
  name?: string
  spec?: string
  qty: number
  unitCost?: number
  amount: number
}

export interface OrderInvoiceTotals {
  subtotalRounded: number
  vatRounded: number
  grandTotal: number
}

export type PayableTransactionItemsResponse = {
  items: PayableTransactionItem[]
  orderInvoiceTotals?: OrderInvoiceTotals
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
  poBillTo?: {
    vendorName: string
    address?: string
    taxId?: string
    phone?: string
    relatedStore?: string
  }
}

export async function getPayableTransactionItemsWithCache(params: {
  refType: string
  refId: number
}): Promise<PayableTransactionItemsResponse> {
  const key = cacheKey('erp:payItems', { refType: params.refType, refId: params.refId })
  const fallback: PayableTransactionItemsResponse = { items: [], orderInvoiceTotals: undefined }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ refType: params.refType, refId: String(params.refId) })
    const res = await apiFetch(`/api/getPayableTransactionItems?${q}`)
    return res.json() as Promise<PayableTransactionItemsResponse>
  }, fallback)
}

// ─── 발주 내역 ───
export async function getPurchaseOrdersWithCache(params?: {
  vendorCode?: string
  poId?: number
  startDate?: string
  endDate?: string
}): Promise<unknown[]> {
  const key = cacheKey('erp:po', {
    vendor: params?.vendorCode || '',
    poId: params?.poId ?? '',
    start: params?.startDate || '',
    end: params?.endDate || '',
  })
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams()
    if (params?.vendorCode?.trim()) q.set('vendorCode', params.vendorCode!.trim())
    if (params?.poId && !isNaN(params.poId)) q.set('poId', String(params.poId))
    if (params?.startDate?.trim()) q.set('startDate', params.startDate!.trim())
    if (params?.endDate?.trim()) q.set('endDate', params.endDate!.trim())
    const url = q.toString() ? `/api/getPurchaseOrders?${q}` : '/api/getPurchaseOrders'
    const res = await apiFetch(url)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

/** 발주 저장·승인 등 이후 목록 재조회 시 캐시된 getPurchaseOrders 결과 제거 */
export async function invalidatePurchaseOrdersListCache(): Promise<void> {
  await deleteErpCacheByPrefix('erp:po')
}

// ─── 점검 이력 ───
export interface CheckHistoryItem {
  id: string
  date: string
  store: string
  inspector: string
  result: string
  memo?: string
  json?: string
}

export async function getCheckHistoryWithCache(params: {
  startStr: string
  endStr: string
  store?: string
  inspector?: string
}): Promise<CheckHistoryItem[]> {
  const key = cacheKey('erp:checkHist', {
    start: params.startStr,
    end: params.endStr,
    store: params.store || '',
    inspector: params.inspector || '',
  })
  const fallback: CheckHistoryItem[] = []
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({
      start: params.startStr,
      end: params.endStr,
      ...(params.store && params.store !== 'All' && { store: params.store }),
      ...(params.inspector && { inspector: params.inspector }),
    })
    const res = await apiFetch(`/api/getCheckHistory?${q}`)
    return res.json() as Promise<CheckHistoryItem[]>
  }, fallback)
}

// ─── 은행 거래 ───
export async function getBankTransactionsWithCache(params: {
  accountId: string | number
  startStr: string
  endStr: string
}): Promise<{ list: unknown[]; summary: unknown }> {
  const key = bankTransactionsCacheKey(params)
  const fallback = { list: [] as unknown[], summary: null }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({
      accountId: String(params.accountId),
      startStr: params.startStr,
      endStr: params.endStr,
    })
    const res = await apiFetch(`/api/getBankTransactions?${q}`)
    return res.json() as Promise<{ list: unknown[]; summary: unknown }>
  }, fallback)
}

/** 통장 거래 목록 오프라인 캐시 무효화 */
export function bankTransactionsCacheKey(params: {
  accountId: string | number
  startStr: string
  endStr: string
}): string {
  return cacheKey('erp:bankTx', {
    accountId: String(params.accountId),
    start: params.startStr,
    end: params.endStr,
  })
}

export async function invalidateBankTransactionsListCache(params: {
  accountId: string | number
  startStr: string
  endStr: string
}): Promise<void> {
  await deleteErpCache(bankTransactionsCacheKey(params))
}

// ─── 시재 ───
export async function getPettyCashListWithCache(params: {
  startStr: string
  endStr: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore?: string
  userRole?: string
  page?: number
  pageSize?: number
}): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const key = cacheKey('erp:petty', {
    start: params.startStr,
    end: params.endStr,
    scope: params.scopeFilter || '',
    store: params.storeFilter || '',
    dept: params.departmentFilter || '',
    page,
    ps: pageSize,
  })
  const fallback = { items: [] as unknown[], total: 0, page, pageSize }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
    if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
    if (params.storeFilter) q.set('storeFilter', params.storeFilter)
    if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
    if (params.userStore) q.set('userStore', params.userStore)
    if (params.userRole) q.set('userRole', params.userRole)
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    const res = await apiFetch(`/api/getPettyCashList?${q}`)
    const data = (await res.json()) as { items?: unknown[]; total?: number; page?: number; pageSize?: number } | unknown[]
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
      return {
        items: data.items,
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
      }
    }
    const arr = Array.isArray(data) ? data : []
    return { items: arr, total: arr.length, page: 1, pageSize: arr.length || pageSize }
  }, fallback)
}

// ─── 품목 목록 ───
export async function getAdminItemsWithCache(options?: {
  scope?: 'outbound' | 'order'
}): Promise<unknown[]> {
  const key = cacheKey('erp:items', { scope: options?.scope || '' })
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    const q = params.toString()
    const res = await apiFetch(`/api/getItems${q ? '?' + q : ''}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

// ─── 창고 목록 ───
export async function getWarehouseLocationsWithCache(): Promise<unknown[]> {
  const key = 'erp:warehouseLocations'
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const res = await apiFetch('/api/getWarehouseLocations')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

// ─── 모바일: 품목/재고·주문·사용 이력 ───
export interface AppDataResult {
  items: { code?: string; name?: string; category?: string; image?: string; spec?: string }[]
  stock: Record<string, number>
}

export async function getAppDataWithCache(
  storeName: string,
  asOfDateOrOptions?: string | { asOfDate?: string; scope?: 'order' | 'stock' }
): Promise<AppDataResult> {
  const opts = typeof asOfDateOrOptions === 'string'
    ? { asOfDate: asOfDateOrOptions }
    : (asOfDateOrOptions || {})
  const key = cacheKey('erp:appData', {
    store: storeName,
    asOf: opts.asOfDate ?? '',
    scope: opts.scope ?? '',
  })
  const fallback: AppDataResult = { items: [], stock: {} }
  return fetchWithCache(key, async () => {
    const params = new URLSearchParams({ storeName })
    if (opts.asOfDate?.trim()) params.set('asOfDate', opts.asOfDate.trim())
    if (opts.scope === 'order') params.set('scope', 'order')
    const res = await apiFetch(`/api/getAppData?${params}`)
    const data = await res.json()
    return { items: data.items || [], stock: data.stock || {} }
  }, fallback)
}

export async function getMyOrderHistoryWithCache(params: {
  store: string
  startStr: string
  endStr: string
  page?: number
  pageSize?: number
}): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const key = cacheKey('erp:myOrders', { ...params, page, pageSize })
  const fallback = { items: [] as unknown[], total: 0, page, pageSize }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({
      store: params.store,
      startStr: params.startStr,
      endStr: params.endStr,
    })
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    const res = await apiFetch(`/api/getMyOrderHistory?${q}`)
    const data = (await res.json()) as { items?: unknown[]; total?: number; page?: number; pageSize?: number } | unknown[]
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.items)) {
      return {
        items: data.items,
        total: data.total ?? 0,
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
      }
    }
    const arr = Array.isArray(data) ? data : []
    return { items: arr, total: arr.length, page: 1, pageSize: arr.length || pageSize }
  }, fallback)
}

export async function getMyUsageHistoryWithCache(params: {
  store: string
  startStr: string
  endStr: string
}): Promise<unknown[]> {
  const key = cacheKey('erp:myUsage', params)
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams(params)
    const res = await apiFetch(`/api/getMyUsageHistory?${q}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

// ─── 로그인 데이터 (매장/유저 목록) - 오프라인 시 이전 캐시로 폼 표시 ───
export interface LoginDataResult {
  users: Record<string, string[]>
  vendors: string[]
  companies?: string[]
  storeCompanies?: Record<string, string>
  storeLabels?: Record<string, string>
  legacyToCanonical?: Record<string, string>
  usedMaster?: boolean
  /** 'api'=정상 조회, 'cache'=캐시 사용(오프라인/실패 시), 'fallback'=캐시 없음(첫 방문 오프라인 등) */
  _source?: 'api' | 'cache' | 'fallback'
}

export async function getLoginDataWithCache(): Promise<LoginDataResult> {
  const key = 'erp:loginData'
  const fallback: LoginDataResult = {
    users: {},
    vendors: [],
    companies: [],
    storeCompanies: {},
    storeLabels: {},
    legacyToCanonical: {},
    usedMaster: false,
    _source: 'fallback',
  }

  if (typeof window !== "undefined" && !isOnline()) {
    await runReachabilityProbe()
  }

  try {
    const res = await apiFetch('/api/getLoginData')
    const data = (await res.json()) as {
      users?: Record<string, string[]>
      vendors?: string[]
      companies?: string[]
      storeCompanies?: Record<string, string>
      storeLabels?: Record<string, string>
      legacyToCanonical?: Record<string, string>
      usedMaster?: boolean
      error?: string
    }
    if (!res.ok && data?.error) throw new Error(data.error)
    if (!res.ok) throw new Error('매장 목록을 불러오지 못했습니다.')
    const result: LoginDataResult = {
      users: data.users ?? {},
      vendors: data.vendors ?? [],
      companies: data.companies ?? [],
      storeCompanies: data.storeCompanies ?? {},
      storeLabels: data.storeLabels ?? {},
      legacyToCanonical: data.legacyToCanonical ?? {},
      usedMaster: data.usedMaster ?? false,
      _source: 'api',
    }
    reportNetworkSuccess()
    // 로그인 화면은 캐시 저장 지연/실패로 막히면 안 된다.
    void setErpCache(key, {
      users: result.users,
      vendors: result.vendors,
      companies: result.companies,
      storeCompanies: result.storeCompanies,
      storeLabels: result.storeLabels,
      legacyToCanonical: result.legacyToCanonical,
      usedMaster: result.usedMaster,
    }).catch(() => {
      /* IndexedDB blocked/unavailable */
    })
    return result
  } catch {
    /* API 실패 또는 navigator·프로브 오탐으로 온라인 분기에 못 들어갔던 경우 — 캐시로 폴백 */
  }

  const cached = await getFromErpCache<{
    users: Record<string, string[]>
    vendors: string[]
    companies?: string[]
    storeCompanies?: Record<string, string>
    storeLabels?: Record<string, string>
    legacyToCanonical?: Record<string, string>
    usedMaster?: boolean
  }>(key)
  if (cached && Object.keys(cached.users || {}).length > 0) {
    reportNetworkSuccess()
    return {
      users: cached.users,
      vendors: cached.vendors ?? [],
      companies: cached.companies ?? [],
      storeCompanies: cached.storeCompanies ?? {},
      storeLabels: cached.storeLabels ?? {},
      legacyToCanonical: cached.legacyToCanonical ?? {},
      usedMaster: cached.usedMaster ?? false,
      _source: 'cache',
    }
  }
  return fallback
}

/** Phase A — API 생략, IndexedDB 로그인 목록만 (하이브리드 cold start) */
export async function readLoginDataFromCacheOnly(): Promise<LoginDataResult> {
  const key = 'erp:loginData'
  const fallback: LoginDataResult = {
    users: {},
    vendors: [],
    companies: [],
    storeCompanies: {},
    storeLabels: {},
    legacyToCanonical: {},
    usedMaster: false,
    _source: 'fallback',
  }
  const cached = await getFromErpCache<{
    users: Record<string, string[]>
    vendors: string[]
    companies?: string[]
    storeCompanies?: Record<string, string>
    storeLabels?: Record<string, string>
    legacyToCanonical?: Record<string, string>
    usedMaster?: boolean
  }>(key)
  if (cached && Object.keys(cached.users || {}).length > 0) {
    return {
      users: cached.users,
      vendors: cached.vendors ?? [],
      companies: cached.companies ?? [],
      storeCompanies: cached.storeCompanies ?? {},
      storeLabels: cached.storeLabels ?? {},
      legacyToCanonical: cached.legacyToCanonical ?? {},
      usedMaster: cached.usedMaster ?? false,
      _source: 'cache',
    }
  }
  return fallback
}

/** processOrder/processUsage 등 후 appData 캐시 무효화 */
export async function invalidateAppDataCache(): Promise<void> {
  await deleteErpCacheByPrefix('erp:appData')
}

/** 품목 저장/삭제 후 getAdminItems 캐시 무효화 */
export async function invalidateAdminItemsCache(): Promise<void> {
  await deleteErpCacheByPrefix('erp:items')
}
