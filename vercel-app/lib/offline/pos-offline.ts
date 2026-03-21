/**
 * POS 오프라인 캐시 - 메뉴/배달앱/프린터/결제설정 등
 * 온라인 시 API 호출 후 캐시 저장, 오프라인/API 실패 시 캐시 사용
 */

import { isOnline } from './network'
import { getFromErpCache, setErpCache } from './cache'
import { apiFetch } from '../api/fetch'
import type { PosPrinterSettings } from '../api-client'

const CACHE_KEYS = {
  POS_MENUS: 'pos:menus',
  POS_MENU_CATEGORIES: 'pos:menuCategories',
  POS_MENU_OPTIONS: 'pos:menuOptions',
  POS_PROMOS: 'pos:promos',
  POS_DELIVERY_APPS: 'pos:deliveryApps',
  POS_PRINTER_SETTINGS: 'pos:printerSettings',
  POS_PAYMENT_SETTINGS: 'pos:paymentSettings',
} as const

function cacheKey(key: string, suffix?: string): string {
  return suffix ? `${key}:${suffix}` : key
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

// ─── POS 메뉴 ───
export async function getPosMenusWithCache(): Promise<unknown[]> {
  const fallback: unknown[] = []
  return fetchWithCache(CACHE_KEYS.POS_MENUS, async () => {
    const res = await apiFetch('/api/getPosMenus')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

export async function getPosMenuCategoriesWithCache(): Promise<{
  categories: string[]
  mainCategories: string[]
}> {
  const fallback = { categories: [] as string[], mainCategories: [] as string[] }
  return fetchWithCache(CACHE_KEYS.POS_MENU_CATEGORIES, async () => {
    const res = await apiFetch('/api/getPosMenuCategories')
    const data = await res.json()
    return data ?? fallback
  }, fallback)
}

export async function getPosMenuOptionsWithCache(): Promise<unknown[]> {
  const fallback: unknown[] = []
  return fetchWithCache(CACHE_KEYS.POS_MENU_OPTIONS, async () => {
    const res = await apiFetch('/api/getPosMenuOptions')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

export async function getPosPromosWithItemsWithCache(): Promise<unknown[]> {
  const fallback: unknown[] = []
  return fetchWithCache(CACHE_KEYS.POS_PROMOS, async () => {
    const res = await apiFetch('/api/getPosPromosWithItems')
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

export async function getPosDeliveryAppsWithCache(params?: {
  storeCode?: string
  includeDisabled?: boolean
}): Promise<unknown[]> {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeDisabled) q.set('includeDisabled', 'true')
  const suffix = q.toString() || 'default'
  const key = cacheKey(CACHE_KEYS.POS_DELIVERY_APPS, suffix)
  const fallback: unknown[] = []
  return fetchWithCache(key, async () => {
    const res = await apiFetch(`/api/getPosDeliveryApps?${q}`)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }, fallback)
}

export async function getPosPrinterSettingsWithCache(params: {
  storeCode: string
}): Promise<PosPrinterSettings> {
  const key = cacheKey(CACHE_KEYS.POS_PRINTER_SETTINGS, params.storeCode)
  const fallback: PosPrinterSettings = {
    storeCode: params.storeCode,
    kitchenMode: 1,
    kitchen1Categories: [],
    kitchen2Categories: [],
  }
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ storeCode: params.storeCode })
    const res = await apiFetch(`/api/getPosPrinterSettings?${q}`)
    const data = (await res.json()) as PosPrinterSettings
    return (data && typeof data === 'object') ? data : fallback
  }, fallback)
}

export async function getPosPaymentSettingsWithCache(params: {
  storeCode: string
}): Promise<Record<string, unknown>> {
  const key = cacheKey(CACHE_KEYS.POS_PAYMENT_SETTINGS, params.storeCode)
  const fallback: Record<string, unknown> = {}
  return fetchWithCache(key, async () => {
    const q = new URLSearchParams({ storeCode: params.storeCode })
    const res = await apiFetch(`/api/getPosPaymentSettings?${q}`)
    const data = await res.json()
    return (data && typeof data === 'object') ? data : fallback
  }, fallback)
}
