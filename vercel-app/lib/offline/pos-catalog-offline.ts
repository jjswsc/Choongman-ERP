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

/** getPosMenus / fetchPosCatalogCached 와 동일 키 — 백그라운드 갱신 시 UI 동기화에 사용 */
export const ERP_POS_CATALOG_MENUS_CACHE_KEY = 'erp:posCatalog:menus' as const

function readClientTenantHint(): string {
  if (typeof window === 'undefined') return ''
  try {
    const fromSession = String(sessionStorage.getItem('cm_tenant_id') || '').trim()
    if (fromSession) return fromSession.toLowerCase()
  } catch {
    /* ignore */
  }
  try {
    const company = String(sessionStorage.getItem('cm_company') || localStorage.getItem('cm_company') || '').trim()
    if (!company) return ''
    return company
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  } catch {
    return ''
  }
}

export function posMenusCatalogCacheKey(storeCode?: string | null): string {
  const tenant = readClientTenantHint()
  const normalized = String(storeCode || '').trim()
  const base = tenant
    ? `${ERP_POS_CATALOG_MENUS_CACHE_KEY}:t:${tenant}`
    : ERP_POS_CATALOG_MENUS_CACHE_KEY
  return normalized ? `${base}:${normalized}` : base
}

/** Wi‑Fi만 연결·서버 무응답 시 fetch가 오래 걸리면 캐시 폴백이 늦아지므로 상한 둠 */
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

/** IDB에 최신 카탈로그가 저장된 뒤 POS 화면이 구버전 메뉴(이미지 URL 없음 등)를 붙잡지 않도록 알림 */
export function notifyPosCatalogUpdated(
  cacheKey: string,
  data: unknown,
  extra?: { storeCode?: string | null }
): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('cm-erp-pos-catalog-updated', {
        detail: { cacheKey, data, storeCode: extra?.storeCode ?? null },
      })
    )
  } catch {
    /* ignore */
  }
}

async function fetchCatalogAndPersist<T>(relativeUrl: string, cacheKey: string, fallback: T): Promise<T> {
  const signal = catalogFetchSignal()
  let res: Response
  try {
    res = await apiFetch(relativeUrl, signal ? { signal } : undefined)
  } catch (e) {
    // #region agent log
    if (
      typeof window !== 'undefined' &&
      e instanceof Error &&
      e.name === 'AbortError' &&
      relativeUrl.includes('getPosMenuOptions')
    ) {
      fetch('http://127.0.0.1:7510/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'd9674e',
        },
        body: JSON.stringify({
          sessionId: 'd9674e',
          hypothesisId: 'H-ABORT',
          location: 'pos-catalog-offline.ts:fetchCatalogAndPersist',
          message: 'catalog fetch aborted (likely AbortSignal.timeout)',
          data: { relativeUrl: relativeUrl.slice(0, 80), cacheKey: cacheKey.slice(0, 48) },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    throw e
  }
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
    notifyPosCatalogUpdated(cacheKey, data)
  } catch {
    /* SSR 등 IndexedDB 없음 */
  }
  return data
}

export async function fetchPosCatalogCached<T>(
  cacheKey: string,
  relativeUrl: string,
  fallback: T,
  options?: { forceNetwork?: boolean }
): Promise<T> {
  const forceNetwork = Boolean(options?.forceNetwork)
  const fromIdb = await readCacheOrNull<T>(cacheKey)

  if (shouldPreferOfflineCache()) {
    if (!forceNetwork && fromIdb !== null) return fromIdb
    try {
      return await fetchCatalogAndPersist(relativeUrl, cacheKey, fallback)
    } catch {
      reportNetworkFailure()
      return fromIdb !== null ? fromIdb : fallback
    }
  }

  /** 온라인 표시여도 IDB에 캐시가 있으면 즉시 표시하고 백그라운드 갱신 (서버 지연 시 메뉴 로딩 체감 개선) */
  if (!forceNetwork && fromIdb !== null) {
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
