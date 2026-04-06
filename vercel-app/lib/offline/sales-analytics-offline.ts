/**
 * 매출 분석 API - 오프라인 시 캐시 사용, 온라인 시 API 호출 후 캐시 저장
 * POS 매출 관리에서 인터넷 유무와 관계없이 동일 화면 표시
 */

import { isOnline } from './network'
import { getFromCache, setCache, cacheKeyAnalytics } from './cache'
import {
  getPosSalesFilterOptions,
  getPosSalesByPeriod,
  getPosSalesByDeliveryApp,
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPayment,
  getPosSalesByStore,
  type PosSalesByPeriodResult,
  type PosSalesPeriodRow,
} from '@/lib/api-client'

export async function getPosSalesFilterOptionsWithCache(params: {
  startStr: string
  endStr: string
}) {
  const key = cacheKeyAnalytics('posOptions', { ...params })
  if (isOnline()) {
    try {
      const data = await getPosSalesFilterOptions(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<{ posOptions: string[] }>(
        'pos_sales_cache',
        key
      )
      return cached ?? { posOptions: [] }
    }
  }
  const cached = await getFromCache<{ posOptions: string[] }>(
    'pos_sales_cache',
    key
  )
  return cached ?? { posOptions: [] }
}

export async function getPosSalesByPeriodWithCache(params: {
  startStr: string
  endStr: string
  groupBy: 'year' | 'month' | 'week' | 'day' | 'dow' | 'hour'
  pos?: string
  stores?: string[]
  orderTypes?: string[]
  splitByStore?: boolean
}) {
  const key = cacheKeyAnalytics('period', {
    ...params,
    groupBy: params.groupBy,
    pos: params.pos ?? '',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
    splitByStore: params.splitByStore ? '1' : '',
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByPeriod(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<unknown>('pos_sales_cache', key)
      if (Array.isArray(cached))
        return { kind: 'aggregate' as const, rows: cached as PosSalesPeriodRow[], truncated: false }
      const typed = cached as PosSalesByPeriodResult | null
      return typed ?? { kind: 'aggregate' as const, rows: [], truncated: false }
    }
  }
  const cached = await getFromCache<unknown>('pos_sales_cache', key)
  if (Array.isArray(cached))
    return { kind: 'aggregate' as const, rows: cached as PosSalesPeriodRow[], truncated: false }
  const typed = cached as PosSalesByPeriodResult | null
  return typed ?? { kind: 'aggregate' as const, rows: [], truncated: false }
}

export async function getPosSalesByDeliveryAppWithCache(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}) {
  const key = cacheKeyAnalytics('delivery', {
    ...params,
    pos: params.pos ?? '',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByDeliveryApp(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<{
        items: {
          channelKey: string
          sales: number
          pct: number
          platforms?: { code: string; sales: number; pct: number }[]
        }[]
        total: number
      }>('pos_sales_cache', key)
      return cached ?? { items: [], total: 0 }
    }
  }
  const cached = await getFromCache<{
    items: {
      channelKey: string
      sales: number
      pct: number
      platforms?: { code: string; sales: number; pct: number }[]
    }[]
    total: number
  }>('pos_sales_cache', key)
  return cached ?? { items: [], total: 0 }
}

export async function getPosSalesByChannelWithCache(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}) {
  const key = cacheKeyAnalytics('channel', {
    ...params,
    pos: params.pos ?? '',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByChannel(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<
        { channelKey: string; sales: number }[]
      >('pos_sales_cache', key)
      return cached ?? []
    }
  }
  const cached = await getFromCache<
    { channelKey: string; sales: number }[]
  >('pos_sales_cache', key)
  return cached ?? []
}

export async function getPosSalesByMenuWithCache(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  search?: string
  searchMode?: 'or' | 'and'
  orderTypes?: string[]
}) {
  const key = cacheKeyAnalytics('menu', {
    ...params,
    search: params.search ?? '',
    searchMode: params.searchMode ?? 'or',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByMenu(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<
        { name: string; qty: number; sales: number }[]
      >('pos_sales_cache', key)
      return cached ?? []
    }
  }
  const cached = await getFromCache<
    { name: string; qty: number; sales: number }[]
  >('pos_sales_cache', key)
  return cached ?? []
}

export async function getPosSalesByPaymentWithCache(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}) {
  const key = cacheKeyAnalytics('payment', {
    ...params,
    pos: params.pos ?? '',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByPayment(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<
        { paymentKey: string; sales: number }[]
      >('pos_sales_cache', key)
      return cached ?? []
    }
  }
  const cached = await getFromCache<
    { paymentKey: string; sales: number }[]
  >('pos_sales_cache', key)
  return cached ?? []
}

export async function getPosSalesByStoreWithCache(params: {
  startStr: string
  endStr: string
  pos?: string
  stores?: string[]
  orderTypes?: string[]
}) {
  const key = cacheKeyAnalytics('store', {
    ...params,
    pos: params.pos ?? '',
    stores: (params.stores ?? []).slice().sort().join(','),
    orderTypes: (params.orderTypes ?? []).slice().sort().join(','),
  })
  if (isOnline()) {
    try {
      const data = await getPosSalesByStore(params)
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<
        {
          storeName: string
          count: number
          subtotal: number
          vat: number
          discount?: number
          total: number
          guestSum?: number
          dineInOrderCount?: number
          dineInTotal?: number
          dineInGuestSum?: number
          salesPerDineInOrder?: number
          salesPerGuest?: number
          salesPerOrder?: number
        }[]
      >('pos_sales_cache', key)
      return cached ?? []
    }
  }
  const cached = await getFromCache<
    {
      storeName: string
      count: number
      subtotal: number
      vat: number
      discount?: number
      total: number
      guestSum?: number
      dineInOrderCount?: number
      dineInTotal?: number
      dineInGuestSum?: number
      salesPerDineInOrder?: number
      salesPerGuest?: number
      salesPerOrder?: number
    }[]
  >('pos_sales_cache', key)
  return cached ?? []
}
