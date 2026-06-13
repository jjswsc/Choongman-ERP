import 'server-only'

import { supabaseSelect } from '@/lib/supabase-server'
import {
  buildLegacyToCanonicalMap,
  buildStoreListFromEmployees,
  employeeRowsMatchingSubmittedStore,
  isEffectivelyResignedForStaffRollup,
  legacyEmployeeStoreToCanonicalWithMap,
  pickBestEmployeeStoreMatch,
  storeLabelsFromMasters,
  type ErpStoreMasterRow,
  type StoreListBuildResult,
} from '@/lib/erp-store-master-shared'

export type { ErpStoreMasterRow, StoreListBuildResult }
export {
  buildLegacyToCanonicalMap,
  buildStoreListFromEmployees,
  employeeRowsMatchingSubmittedStore,
  isEffectivelyResignedForStaffRollup,
  legacyEmployeeStoreToCanonicalWithMap,
  pickBestEmployeeStoreMatch,
  storeLabelsFromMasters,
}

/** getPosOrders 등 — erp_stores 마스터는 자주 안 바뀌므로 짧게 캐시(동일 프로세스) */
const ERP_STORES_MASTER_CACHE_MS = 5 * 60 * 1000
let erpStoresMasterCache: { at: number; rows: ErpStoreMasterRow[] } | null = null

export function invalidateErpStoresMasterCache(): void {
  erpStoresMasterCache = null
}

export async function fetchErpStoresMaster(): Promise<ErpStoreMasterRow[]> {
  const cachedAt = erpStoresMasterCache?.at ?? 0
  if (erpStoresMasterCache && Date.now() - cachedAt < ERP_STORES_MASTER_CACHE_MS) {
    return erpStoresMasterCache.rows
  }
  const rows = await fetchErpStoresMasterFromDb()
  erpStoresMasterCache = { at: Date.now(), rows }
  return rows
}

async function fetchErpStoresMasterFromDb(): Promise<ErpStoreMasterRow[]> {
  const legacySelect =
    'store_code,display_name,display_name_ko,display_name_en,display_name_th,aliases,sort_order,is_active,photo_url,map_query,address'
  const legacySelectBasic = 'store_code,display_name,aliases,sort_order,is_active'
  try {
    const rows = (await supabaseSelect('erp_stores', {
      select: legacySelect,
      order: 'sort_order.asc,display_name.asc',
      limit: 500,
    })) as ErpStoreMasterRow[] | null
    return (rows || []).filter((r) => r.is_active !== false)
  } catch {
    try {
      const rows = (await supabaseSelect('erp_stores', {
        select: legacySelectBasic,
        order: 'sort_order.asc,display_name.asc',
        limit: 500,
      })) as ErpStoreMasterRow[] | null
      return (rows || []).filter((r) => r.is_active !== false)
    } catch {
      try {
        // SaaS 전환 스키마(tenant_id/store_name/store_code) 호환
        const rows = (await supabaseSelect('erp_stores', {
          select: 'tenant_id,store_name,store_code,is_active',
          order: 'store_name.asc',
          limit: 1000,
        })) as {
          tenant_id?: string | null
          store_name?: string | null
          store_code?: string | null
          is_active?: boolean | null
        }[] | null
        const mapped = (rows || [])
          .filter((r) => r.is_active !== false)
          .map((r, idx) => {
            const tenant = String(r.tenant_id || '').trim()
            const storeName = String(r.store_name || '').trim()
            const rawCode = String(r.store_code || '').trim()
            const fallbackCode = `${tenant || 'tenant'}:${storeName || `store_${idx + 1}`}`
            const uniqueLabel = `${tenant || 'tenant'} / ${storeName || rawCode || fallbackCode}`
            const aliases: string[] = []
            if (storeName) aliases.push(storeName)
            if (rawCode && rawCode !== storeName) aliases.push(rawCode)
            return {
              store_code: rawCode || fallbackCode,
              display_name: uniqueLabel,
              aliases,
              sort_order: idx,
              is_active: r.is_active !== false,
            } as ErpStoreMasterRow
          })
        return mapped
      } catch {
        return []
      }
    }
  }
}
