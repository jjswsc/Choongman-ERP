import { getAppDataWithCache, invalidateAppDataCache as invalidateAppDataCacheOffline } from '../offline/erp-offline'

export interface AppItem {
  code: string
  category: string
  name: string
  spec: string
  price: number
  cost: number
  taxType: string
  safeQty: number
  image?: string
  description?: string
  purchaseSource?: 'hq' | 'store'
  orderDisabled?: boolean
  stockBaseUnit?: string
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
}

/** 재고/품목 변경 후 캐시 무효화 (processOrder, processUsage, adjustStock 등 호출 후) */
export function invalidateAppDataCache() {
  invalidateAppDataCacheOffline()
}

export async function getAppData(
  storeName: string,
  asOfDateOrOptions?: string | { asOfDate?: string; scope?: 'order' | 'stock' }
) {
  const opts = typeof asOfDateOrOptions === 'string'
    ? { asOfDate: asOfDateOrOptions }
    : (asOfDateOrOptions || {})
  const raw = await getAppDataWithCache(storeName, opts)
  return { items: (raw.items || []) as AppItem[], stock: raw.stock || {} }
}
