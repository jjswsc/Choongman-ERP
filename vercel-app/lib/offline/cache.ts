/**
 * 오프라인 캐시 유틸 - TTL 기반 IndexedDB 읽기/쓰기
 * 매출·영수증·시재 데이터 최대 ~30일 보관
 */

import { getDB, STORES } from './db'

const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일

export interface CacheEntry<T> {
  cacheKey: string
  data: T
  cachedAt: number
}

export function cacheKeyOrders(storeCode: string, startStr: string, endStr: string): string {
  return `orders:${storeCode}:${startStr}:${endStr}`
}

export function cacheKeySales(storeCode: string, dateStr: string): string {
  return `sales:${storeCode}:${dateStr}`
}

/** 매출 분석 캐시 키 (기간/매장별) */
export function cacheKeyAnalytics(
  type: 'posOptions' | 'period' | 'delivery' | 'channel' | 'menu' | 'payment' | 'store',
  params: { startStr: string; endStr: string; pos?: string; groupBy?: string; search?: string }
): string {
  const { startStr, endStr, pos = '', groupBy = '', search = '' } = params
  return `analytics:${type}:${startStr}:${endStr}:${pos}:${groupBy}:${search}`
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
