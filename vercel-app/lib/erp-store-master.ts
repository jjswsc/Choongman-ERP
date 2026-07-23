import 'server-only'

import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { loadErpStoreRowsForTenant } from '@/lib/saas-tenant-stores-server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { normStoreKey } from '@/lib/store-list-keys'
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
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'

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

export type StoreListEmployeeRow = {
  store?: string
  name?: string
  nick?: string
  job?: string
  role?: string
  resign_date?: string | null
  employment_status?: string | null
  tenant_id?: string | null
  company?: string | null
}

/** getPosOrders 등 — erp_stores 마스터는 자주 안 바뀌므로 짧게 캐시(동일 프로세스) */
const ERP_STORES_MASTER_CACHE_MS = 5 * 60 * 1000
let erpStoresMasterCache: { at: number; rows: ErpStoreMasterRow[] } | null = null

const ERP_STORES_TENANT_CACHE_MS = 60 * 1000
const erpStoresTenantCache = new Map<string, { at: number; rows: ErpStoreMasterRow[] }>()

export function invalidateErpStoresMasterCache(): void {
  erpStoresMasterCache = null
  erpStoresTenantCache.clear()
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

function mapTenantErpRowToMaster(r: Record<string, unknown>, idx: number): ErpStoreMasterRow {
  const code = String(r.store_code ?? '').trim()
  const storeName = String(r.store_name ?? '').trim()
  const displayName = String(r.display_name ?? '').trim()
  const label = displayName || storeName || code
  const aliases: string[] = []
  if (Array.isArray(r.aliases)) {
    for (const a of r.aliases) {
      const s = String(a ?? '').trim()
      if (s) aliases.push(s)
    }
  }
  if (storeName && storeName !== code && !aliases.includes(storeName)) aliases.push(storeName)
  if (displayName && displayName !== code && displayName !== storeName && !aliases.includes(displayName)) {
    aliases.push(displayName)
  }
  return {
    store_code: code || label || `store_${idx + 1}`,
    display_name: label || code || `store_${idx + 1}`,
    display_name_ko: r.display_name_ko != null ? String(r.display_name_ko) : null,
    display_name_en: r.display_name_en != null ? String(r.display_name_en) : null,
    display_name_th: r.display_name_th != null ? String(r.display_name_th) : null,
    aliases,
    sort_order: Number(r.sort_order) || idx,
    is_active: r.is_active !== false,
    photo_url: r.photo_url != null ? String(r.photo_url) : null,
    map_query: r.map_query != null ? String(r.map_query) : null,
    address: r.address != null ? String(r.address) : null,
  }
}

/** Omni SaaS — 로그인 테넌트의 erp_stores만 (타사 매장 노출 방지) */
export async function fetchErpStoresMasterForTenant(
  tenantId: string,
  companyName = ''
): Promise<ErpStoreMasterRow[]> {
  const tid = String(tenantId || '').trim().toLowerCase()
  if (!tid) return []
  const cacheKey = `${tid}\0${String(companyName || '').trim().toLowerCase()}`
  const hit = erpStoresTenantCache.get(cacheKey)
  if (hit && Date.now() - hit.at < ERP_STORES_TENANT_CACHE_MS) return hit.rows

  const rows = await loadErpStoreRowsForTenant({
    tenantId: tid,
    companyName,
    offset: 0,
    limit: 500,
  })
  const mapped = rows
    .filter((r) => r.is_active !== false)
    .map((r, idx) => mapTenantErpRowToMaster(r, idx))
  erpStoresTenantCache.set(cacheKey, { at: Date.now(), rows: mapped })
  return mapped
}

function employeeMatchesTenantStores(
  empStore: string,
  masters: ErpStoreMasterRow[]
): boolean {
  const raw = String(empStore || '').trim()
  if (!raw) return false
  const nk = normStoreKey(raw)
  for (const m of masters) {
    const code = String(m.store_code || '').trim()
    if (code && (code === raw || normStoreKey(code) === nk)) return true
    const dn = String(m.display_name || '').trim()
    if (dn && (dn === raw || normStoreKey(dn) === nk)) return true
    for (const a of m.aliases || []) {
      const alias = String(a || '').trim()
      if (alias && (alias === raw || normStoreKey(alias) === nk)) return true
    }
  }
  return false
}

const STORE_LIST_EMP_SELECT =
  'store,name,nick,job,role,resign_date,employment_status' as const
const STORE_LIST_EMP_SELECT_TENANT =
  'store,name,nick,job,role,resign_date,employment_status,tenant_id' as const

/** getStoreList용 직원 — SaaS면 tenant_id(또는 테넌트 매장)로 제한 */
export async function loadEmployeesForStoreList(params?: {
  tenantId?: string
  companyName?: string
  masters?: ErpStoreMasterRow[]
}): Promise<StoreListEmployeeRow[]> {
  const tenantId = String(params?.tenantId || '').trim().toLowerCase()
  const companyName = String(params?.companyName || '').trim()

  if (!tenantId || isLegacyChoongmanErpSupabase()) {
    const rows = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: STORE_LIST_EMP_SELECT,
      limit: 20000,
    })) as StoreListEmployeeRow[] | null
    return rows || []
  }

  try {
    const rows = (await supabaseSelectFilter(
      'employees',
      `tenant_id=eq.${encodeURIComponent(tenantId)}`,
      {
        order: 'id.asc',
        select: STORE_LIST_EMP_SELECT_TENANT,
        limit: 10000,
      }
    )) as StoreListEmployeeRow[] | null
    if (rows && rows.length > 0) return rows
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/column|42703|tenant_id|PGRST204/i.test(msg)) throw e
  }

  if (companyName) {
    try {
      const rows = (await supabaseSelectFilter(
        'employees',
        `company=eq.${encodeURIComponent(companyName)}`,
        {
          order: 'id.asc',
          select: `${STORE_LIST_EMP_SELECT},company`,
          limit: 10000,
        }
      )) as StoreListEmployeeRow[] | null
      if (rows && rows.length > 0) return rows
    } catch {
      /* company 컬럼 없거나 미매칭 — 아래 마스터 매칭 */
    }
  }

  const masters = params?.masters?.length
    ? params.masters
    : await fetchErpStoresMasterForTenant(tenantId, companyName)
  if (!masters.length) return []

  const all = (await supabaseSelect('employees', {
    order: 'id.asc',
    select: STORE_LIST_EMP_SELECT,
    limit: 20000,
  })) as StoreListEmployeeRow[] | null
  return (all || []).filter((r) => employeeMatchesTenantStores(String(r.store || ''), masters))
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
      if (isLegacyChoongmanErpSupabase()) return []
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
            /**
             * store_code 가 비거나 tenant:name 합성키면 운영 코드만 쓴다.
             * (malatang01:1001 이면 POS 스코프 store_code=1001 과 불일치 → 메뉴 0건)
             */
            const storeCode =
              stripTenantPrefixedStoreCode(rawCode) ||
              storeName ||
              `store_${idx + 1}`
            const uniqueLabel =
              tenant && storeName
                ? `${tenant} / ${storeName}`
                : storeName || storeCode
            const aliases: string[] = []
            if (storeName && storeName !== storeCode) aliases.push(storeName)
            if (rawCode && rawCode !== storeCode) aliases.push(rawCode)
            return {
              store_code: storeCode,
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
