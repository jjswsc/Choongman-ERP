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
}): string {
  const { startStr, endStr, storeFilter = '' } = params
  return `petty:list:${storeFilter}:${startStr}:${endStr}`
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
}): Promise<PettyCashItem[]> {
  const { startStr, endStr, storeFilter = '' } = params
  const key = cacheKeyPettyList({ startStr, endStr, storeFilter })

  if (isOnline()) {
    try {
      const data = await getPettyCashList({
        startStr: params.startStr,
        endStr: params.endStr,
        scopeFilter: 'store',
        storeFilter: storeFilter || undefined,
        userStore: params.userStore,
        userRole: params.userRole,
      })
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<PettyCashItem[]>('pos_sales_cache', key)
      return cached ?? []
    }
  }

  const cached = await getFromCache<PettyCashItem[]>('pos_sales_cache', key)
  return cached ?? []
}
