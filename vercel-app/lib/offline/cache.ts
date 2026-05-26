/**
 * 오프라인 캐시 유틸 - TTL 기반 IndexedDB 읽기/쓰기
 * 매출·영수증·시재 데이터 최대 ~30일 보관
 */

import { getDB, STORES } from './db'

const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일
const ERP_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24시간 (ERP 기본 데이터)
/** POS 메뉴·화면구성 등 — 오프라인 영업일 넘겨도 스냅샷 유지 */
const ERP_POS_CATALOG_TTL_MS = 30 * 24 * 60 * 60 * 1000

function erpCacheMaxAgeMs(cacheKey: string): number {
  /** POS 워밍·터미널이 쓰는 키(메뉴·테이블·결제수단·회원 등) — 24시간 만료 시 오프라인 메뉴 공백 방지 */
  if (cacheKey.startsWith('erp:pos')) return ERP_POS_CATALOG_TTL_MS
  return ERP_CACHE_TTL_MS
}

export interface CacheEntry<T> {
  cacheKey: string
  data: T
  cachedAt: number
}

export function cacheKeyOrders(
  storeCode: string,
  startStr: string,
  endStr: string,
  opts?: { posBizDay?: boolean }
): string {
  const biz = opts?.posBizDay ? ':biz' : ''
  return `orders:${storeCode}:${startStr}:${endStr}${biz}`
}

export function cacheKeySales(storeCode: string, dateStr: string): string {
  return `sales:${storeCode}:${dateStr}`
}

/** 매출 분석 캐시 키 (기간/매장별) */
export function cacheKeyAnalytics(
  type: 'posOptions' | 'period' | 'delivery' | 'channel' | 'menu' | 'payment' | 'store',
  params: {
    startStr: string
    endStr: string
    pos?: string
    groupBy?: string
    search?: string
    orderTypes?: string
    /** 쉼표로 이어 붙인 정규화된 매장 목록 */
    stores?: string
    splitByStore?: string
    searchMode?: string
  }
): string {
  const {
    startStr,
    endStr,
    pos = '',
    groupBy = '',
    search = '',
    orderTypes = '',
    stores = '',
    splitByStore = '',
    searchMode = '',
  } = params
  return `analytics:${type}:${startStr}:${endStr}:${pos}:${groupBy}:${search}:${orderTypes}:${stores}:${splitByStore}:${searchMode}`
}

export async function getFromCache<T>(
  storeName: 'pos_orders_cache' | 'pos_sales_cache',
  cacheKey: string
): Promise<T | null> {
  const db = await getDB()
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(cacheKey)
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined
      if (!entry) {
        resolve(null)
        return
      }
      const age = Date.now() - entry.cachedAt
      if (age > TTL_MS) {
        // 만료됨 - 삭제 (비동기)
        const delTx = db.transaction(storeName, 'readwrite')
        delTx.objectStore(storeName).delete(cacheKey)
        resolve(null)
        return
      }
      resolve(entry.data)
    }
    req.onerror = () => resolve(null)
  })
}

export async function setCache<T>(
  storeName: 'pos_orders_cache' | 'pos_sales_cache',
  cacheKey: string,
  data: T
): Promise<void> {
  const db = await getDB()
  const entry: CacheEntry<T> = {
    cacheKey,
    data,
    cachedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function getErpCacheDb(): Promise<IDBDatabase | null> {
  try {
    const db = await getDB()
    return db.objectStoreNames.contains(STORES.ERP_CACHE) ? db : null
  } catch {
    return null
  }
}

/** ERP 오프라인 캐시 - 매장/거래처/점검항목 등 */
export async function getFromErpCache<T>(cacheKey: string): Promise<T | null> {
  const db = await getErpCacheDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.ERP_CACHE, 'readonly')
    const store = tx.objectStore(STORES.ERP_CACHE)
    const req = store.get(cacheKey)
    req.onsuccess = () => {
      const entry = req.result as (CacheEntry<T> & { cacheKey: string }) | undefined
      if (!entry) {
        resolve(null)
        return
      }
      const age = Date.now() - entry.cachedAt
      const maxAge = erpCacheMaxAgeMs(cacheKey)
      if (age > maxAge) {
        const delTx = db.transaction(STORES.ERP_CACHE, 'readwrite')
        delTx.objectStore(STORES.ERP_CACHE).delete(cacheKey)
        resolve(null)
        return
      }
      resolve(entry.data)
    }
    req.onerror = () => resolve(null)
  })
}

/** ERP 캐시 항목 저장 시각(ms). 만료·없음이면 null */
export async function getErpCacheCachedAt(cacheKey: string): Promise<number | null> {
  const db = await getErpCacheDb()
  if (!db) return null
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.ERP_CACHE, 'readonly')
    const store = tx.objectStore(STORES.ERP_CACHE)
    const req = store.get(cacheKey)
    req.onsuccess = () => {
      const entry = req.result as (CacheEntry<unknown> & { cacheKey: string }) | undefined
      if (!entry) {
        resolve(null)
        return
      }
      const age = Date.now() - entry.cachedAt
      if (age > erpCacheMaxAgeMs(cacheKey)) {
        const delTx = db.transaction(STORES.ERP_CACHE, 'readwrite')
        delTx.objectStore(STORES.ERP_CACHE).delete(cacheKey)
        resolve(null)
        return
      }
      resolve(entry.cachedAt)
    }
    req.onerror = () => resolve(null)
  })
}

export async function setErpCache<T>(cacheKey: string, data: T): Promise<void> {
  const db = await getErpCacheDb()
  if (!db) return
  const entry = { cacheKey, data, cachedAt: Date.now() }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ERP_CACHE, 'readwrite')
    const store = tx.objectStore(STORES.ERP_CACHE)
    const req = store.put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** 단일 ERP 캐시 키 삭제 (통장 목록 등 갱신 후 재조회용) */
export async function deleteErpCache(cacheKey: string): Promise<void> {
  const db = await getErpCacheDb()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ERP_CACHE, 'readwrite')
    const store = tx.objectStore(STORES.ERP_CACHE)
    const req = store.delete(cacheKey)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** ERP 캐시 키 prefix로 삭제 (예: erp:appData) */
export async function deleteErpCacheByPrefix(prefix: string): Promise<void> {
  const db = await getErpCacheDb()
  if (!db) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ERP_CACHE, 'readwrite')
    const store = tx.objectStore(STORES.ERP_CACHE)
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false)
    const req = store.openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        store.delete(cursor.primaryKey)
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
}
