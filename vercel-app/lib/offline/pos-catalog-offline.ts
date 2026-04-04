/**
 * POS 주문/터미널용 메뉴·옵션·프로모 읽기 캐시.
 * 온라인에서 API 성공 시 IndexedDB(erp_cache)에 저장.
 * 오프라인일 때는 IDB 우선, 없으면 fetch → Serwist(NetworkFirst) 캐시 폴백(PWA/프로덕션).
 */

import { apiFetch } from '@/lib/api/fetch'
import { getFromErpCache, setErpCache } from '@/lib/offline/cache'
import {
  reportNetworkFailure,
  reportNetworkSuccess,
  shouldPreferOfflineCache,
} from '@/lib/offline/network'

/** Wi‑Fi만 연결·서버 무응답 시 fetch가 오래 걸리면 캐시 폴백이 늦어지므로 상한 둠 */
const POS_CATALOG_FETCH_MS = 4_000

function catalogFetchSignal(): AbortSignal | undefined {
  try {
    const AS = AbortSignal as typeof AbortSignal & {
      timeout?: (ms: number) => AbortSignal
    }
    if (typeof AS.timeout === 'function') return AS.timeout(POS_CATALOG_FETCH_MS)
  } catch {}
  return undefined
}

async function readCache<T>(cacheKey: string, fallback: T): Promise<T> {
  try {
    const c = await getFromErpCache<T>(cacheKey)
    return c ?? fallback
  } catch {
    return fallback
  }
}

/** IDB 히트 여부만 구분 (빈 배열·빈 객체는 유효한 캐시로 취급) */
async function readCacheOrNull<T>(cacheKey: string): Promise<T | null> {
  try {
    const c = await getFromErpCache<T>(cacheKey)
    return c === undefined || c === null ? null : c
  } catch {
    return null
  }
}

async function fetchCatalogAndPersist<T>(relativeUrl: string, cacheKey: string, fallback: T): Promise<T> {
  const signal = catalogFetchSignal()
  const res = await apiFetch(relativeUrl, signal ? { signal } : undefined)
  if (res.ok) reportNetworkSuccess()
  else if (res.status >= 500) reportNetworkFailure()
  if (!res.ok) {
    return readCache(cacheKey, fallback)
  }
  const data = (await res.json()) as T

  const isProtectedCatalogKey =
    cacheKey.startsWith('erp:posCatalog:') || cacheKey.startsWith('erp:posTableLayout:')
  const isEmptyPayload = (() => {
    if (Array.isArray(data)) return data.length === 0
    if (!data || typeof data !== 'object') return false
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.layout)) return obj.layout.length === 0
    if (Array.isArray(obj.categories) && Array.isArray(obj.mainCategories)) {
      return obj.categories.length === 0 && obj.mainCategories.length === 0
    }
    return false
  })()
  if (isProtectedCatalogKey && isEmptyPayload) {
    const prev = await readCacheOrNull<T>(cacheKey)
    const hasPrev = (() => {
      if (Array.isArray(prev)) return prev.length > 0
      if (!prev || typeof prev !== 'object') return false
      const obj = prev as Record<string, unknown>
      if (Array.isArray(obj.layout)) return obj.layout.length > 0
      if (Array.isArray(obj.categories) && Array.isArray(obj.mainCategories)) {
        return obj.categories.length > 0 || obj.mainCategories.length > 0
      }
      return Object.keys(obj).length > 0
    })()
    if (hasPrev) {
      // 서버 fallback(200 + empty)로 기존 캐시를 오염시키지 않도록 보호
      return prev as T
    }
  }
  try {
    await setErpCache(cacheKey, data)
  } catch {
    /* SSR 등 IndexedDB 없음 */
  }
  return data
}

export async function fetchPosCatalogCached<T>(
  cacheKey: string,
  relativeUrl: string,
  fallback: T
): Promise<T> {
  const fromIdb = await readCacheOrNull<T>(cacheKey)

  if (shouldPreferOfflineCache()) {
    if (fromIdb !== null) return fromIdb
    try {
      return await fetchCatalogAndPersist(relativeUrl, cacheKey, fallback)
    } catch {
      reportNetworkFailure()
      return fallback
    }
  }

  /** 온라인 표시여도 IDB에 캐시가 있으면 즉시 표시하고 백그라운드 갱신 (서버 지연 시 메뉴 로딩 체감 개선) */
  if (fromIdb !== null) {
    void fetchCatalogAndPersist(relativeUrl, cacheKey, fallback).catch(() => {})
    return fromIdb
  }

  try {
    return await fetchCatalogAndPersist(relativeUrl, cacheKey, fallback)
  } catch {
    reportNetworkFailure()
    return readCache(cacheKey, fallback)
  }
}
