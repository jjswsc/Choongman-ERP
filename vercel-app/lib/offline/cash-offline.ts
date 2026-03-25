/**
 * 시재(패티캐시) API - 오프라인 시 캐시 사용
 * POS 시재관리: 매출 관리와 동일 동작
 */

import { isOnline } from './network'
import { getFromCache, setCache } from './cache'
import {
  getPettyCashOptions,
  getPettyCashList,
  type PettyCashItem,
} from '@/lib/api-client'

function cacheKeyPettyOptions(): string {
  return 'petty:options'
}

function cacheKeyPettyList(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  page?: number
  pageSize?: number
}): string {
  const { startStr, endStr, storeFilter = '', page = 1, pageSize = 25 } = params
  return `petty:list:${storeFilter}:${startStr}:${endStr}:p${page}:s${pageSize}`
}

export async function getPettyCashOptionsWithCache(): Promise<{
  stores: string[]
  officeDepartments: string[]
}> {
  const key = cacheKeyPettyOptions()
  if (isOnline()) {
    try {
      const data = await getPettyCashOptions()
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<{ stores: string[]; officeDepartments: string[] }>(
        'pos_sales_cache',
        key
      )
      return cached ?? { stores: [], officeDepartments: [] }
    }
  }
  const cached = await getFromCache<{ stores: string[]; officeDepartments: string[] }>(
    'pos_sales_cache',
    key
  )
  return cached ?? { stores: [], officeDepartments: [] }
}

export async function getPettyCashListWithCache(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  page?: number
  pageSize?: number
}): Promise<{ items: PettyCashItem[]; total: number; page: number; pageSize: number }> {
  const { startStr, endStr, storeFilter = '' } = params
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25
  const key = cacheKeyPettyList({ startStr, endStr, storeFilter, page, pageSize })
  const empty = { items: [] as PettyCashItem[], total: 0, page, pageSize }

  if (isOnline()) {
    try {
      const data = await getPettyCashList({
        startStr: params.startStr,
        endStr: params.endStr,
        scopeFilter: 'store',
        storeFilter: storeFilter || undefined,
        userStore: params.userStore,
        userRole: params.userRole,
        page,
        pageSize,
      })
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<{ items: PettyCashItem[]; total: number; page: number; pageSize: number }>(
        'pos_sales_cache',
        key
      )
      return cached ?? empty
    }
  }

  const cached = await getFromCache<{ items: PettyCashItem[]; total: number; page: number; pageSize: number }>(
    'pos_sales_cache',
    key
  )
  return cached ?? empty
}
