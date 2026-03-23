/**
 * ERP 오프라인 캐시 - 1단계: 읽기 캐시
 * 온라인 시 API 호출 후 캐시 저장, 오프라인/API 실패 시 캐시 사용
 */

import { isOnline } from './network'
import { getFromErpCache, setErpCache, deleteErpCache, deleteErpCacheByPrefix } from './cache'
import { apiFetch } from '../api/fetch'

const CACHE_KEYS = {
  STORE_LIST: 'erp:storeList',
  VENDORS_PURCHASE: 'erp:vendorsPurchase',
  VENDORS_SALES: 'erp:vendorsSales',
  CHECKLIST_ITEMS_ACTIVE: 'erp:checklistItems:active',
  CHECKLIST_ITEMS_ALL: 'erp:checklistItems:all',
} as const

export interface StoreListData {
  stores: string[]
  users: Record<string, string[]>
  staffByStore?: Record<string, { name: string; nick: string; job?: string; role?: string }[]>
}

export async function getStoreListWithCache(): Promise<StoreListData> {
  const fallback = { stores: [], users: {}, staffByStore: {} }
  if (isOnline()) {
    try {
      const res = await apiFetch('/api/getStoreList')
      const data = (await res.json()) as StoreListData
      await setErpCache(CACHE_KEYS.STORE_LIST, data)
      return data
    } catch {
      const cached = await getFromErpCache<StoreListData>(CACHE_KEYS.STORE_LIST)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<StoreListData>(CACHE_KEYS.STORE_LIST)
  return cached ?? fallback
}

export type VendorForPurchase = {
  code: string
  name: string
  address?: string
  taxId?: string
  phone?: string
  bankAccountNo?: string | null
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

export async function getVendorsForSalesWithCache(): Promise<{ name: string }[]> {
  const fallback: { name: string }[] = []
  if (isOnline()) {
    try {
      const res = await apiFetch('/api/getVendorsForSales')
      const data = (await res.json()) as { name: string }[]
      await setErpCache(CACHE_KEYS.VENDORS_SALES, data)
      return data ?? fallback
    } catch {
      const cached = await getFromErpCache<{ name: string }[]>(CACHE_KEYS.VENDORS_SALES)
      return cached ?? fallback
    }
  }
  const cached = await getFromErpCache<{ name: string }[]>(CACHE_KEYS.VENDORS_SALES)
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
  items: { id?: number; trans_date?: string; ref_type?: string; ref_id?: number; amount?: number; memo?: string; invoice_no?: string; invoice_received?: boolean }[]
}

export async function getReceivablePayableListWithCache(params: {
  type: 'receivable' | 'payable'
  storeFilter?: string
  vendorFilter?: string
  startStr: string
  endStr: string
  userStore?: string
  userRole?: string
}): Promise<{ type: string; list: ReceivablePayableItem[] }> {
  const key = cacheKey('erp:recPay', {
    type: params.type,
    store: params.storeFilter || '',
    vendor: params.vendorFilter || '',
    start: params.startStr,
    end: params.endStr,
  })
  const fallback: { type: string; list: ReceivablePayableItem[] } = { type: params.type, list: [] }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({
      type: params.type,
      startStr: params.startStr,
      endStr: params.endStr,
    })
    if (params.storeFilter) q.set('storeFilter', params.storeFilter)
    if (params.vendorFilter) q.set('vendorFilter', params.vendorFilter)
    if (params.userStore) q.set('userStore', params.userStore)
    if (params.userRole) q.set('userRole', params.userRole)
    const res = await apiFetch(`/api/getReceivablePayableList?${q}`)
    return res.json() as Promise<{ type: string; list: ReceivablePayableItem[] }>
  }, fallback)
}

export interface PayableTransactionItem {
  code?: string
  name?: string
  spec?: string
  qty: number
  unitCost?: number
  amount: number
}

export async function getPayableTransactionItemsWithCache(params: {
  refType: string
  refId: number
}): Promise<{ items: PayableTransactionItem[] }> {
  const key = cacheKey('erp:payItems', { refType: params.refType, refId: params.refId })
  const fallback = { items: [] as PayableTransactionItem[] }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ refType: params.refType, refId: String(params.refId) })
    const res = await apiFetch(`/api/getPayableTransactionItems?${q}`)
    return res.json() as Promise<{ items: PayableTransactionItem[] }>
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

/** 통장 거래 목록 오프라인 캐시 무효화 (대사 등 반영 후 재조회) */
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
}): Promise<unknown[]> {
  const key = cacheKey('erp:petty', {
    start: params.startStr,
    end: params.endStr,
    scope: params.scopeFilter || '',
    store: params.storeFilter || '',
    dept: params.departmentFilter || '',
  })
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ startStr: params.startStr, endStr: params.endStr })
    if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
    if (params.storeFilter) q.set('storeFilter', params.storeFilter)
    if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
    if (params.userStore) q.set('userStore', params.userStore)
    if (params.userRole) q.set('userRole', params.userRole)
    const res = await apiFetch(`/api/getPettyCashList?${q}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
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
}): Promise<unknown[]> {
  const key = cacheKey('erp:myOrders', params)
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams(params)
    const res = await apiFetch(`/api/getMyOrderHistory?${q}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
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
  /** 'api'=정상 조회, 'cache'=캐시 사용(오프라인/실패 시), 'fallback'=캐시 없음(첫 방문 오프라인 등) */
  _source?: 'api' | 'cache' | 'fallback'
}

export async function getLoginDataWithCache(): Promise<LoginDataResult> {
  const key = 'erp:loginData'
  const fallback: LoginDataResult = { users: {}, vendors: [], _source: 'fallback' }
  if (isOnline()) {
    try {
      const res = await apiFetch('/api/getLoginData')
      const data = (await res.json()) as { users?: Record<string, string[]>; vendors?: string[]; error?: string }
      if (!res.ok && data?.error) throw new Error(data.error)
      if (!res.ok) throw new Error('매장 목록을 불러오지 못했습니다.')
      const result: LoginDataResult = {
        users: data.users ?? {},
        vendors: data.vendors ?? [],
        _source: 'api',
      }
      await setErpCache(key, { users: result.users, vendors: result.vendors })
      return result
    } catch {
      const cached = await getFromErpCache<{ users: Record<string, string[]>; vendors: string[] }>(key)
      if (cached && Object.keys(cached.users || {}).length > 0) {
        return { ...cached, _source: 'cache' }
      }
      return fallback
    }
  }
  const cached = await getFromErpCache<{ users: Record<string, string[]>; vendors: string[] }>(key)
  if (cached && Object.keys(cached.users || {}).length > 0) {
    return { ...cached, _source: 'cache' }
  }
  return fallback
}

/** processOrder/processUsage 등 후 appData 캐시 무효화 */
export async function invalidateAppDataCache(): Promise<void> {
  await deleteErpCacheByPrefix('erp:appData')
}
