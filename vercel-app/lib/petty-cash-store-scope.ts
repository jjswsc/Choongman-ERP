import { hasOfficeStaffScope } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export type PettyCashStoreScopeInput = {
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore: string
  userRole: string
  allowedStores: string[]
}

/** 전 매장 Petty Cash 조회 — 본사 role·회계·오피스 소속(순회 SV 포함) */
export function canSearchAllPettyCashStores(role: string, store?: string): boolean {
  return hasOfficeStaffScope(role, store)
}

/** 매장 직원·가맹: 본인 매장 + extra_stores(allowedStores)만 선택지에 둠 */
export function scopedPettyCashStoreOptions(
  masterStores: string[],
  userStore: string,
  allowedStores?: string[] | null
): string[] {
  const home = String(userStore || '').trim()
  const allowed = Array.from(
    new Set(
      [home, ...(allowedStores || [])]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
    )
  )
  const master = new Set((masterStores || []).map((s) => String(s || '').trim()).filter(Boolean))
  const picked = allowed.filter((s) => master.has(s) || s === home)
  return picked.length ? picked : home ? [home] : []
}

/** getPettyCashList / getPettyCashSummary / getPettyCashMonthDetail 공통 매장·본사 범위 */
export function resolvePettyCashEffectiveStore(input: PettyCashStoreScopeInput): {
  effectiveStore: string
  forbidden: boolean
} {
  let storeFilter = String(input.storeFilter || '').trim()
  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const isOffice = canSearchAllPettyCashStores(input.userRole, input.userStore)

  if (!isOffice) {
    if (!storeFilter || storeFilter === 'All' || storeFilter === '전체') {
      const fallbackStore = String(input.allowedStores[0] || input.userStore || '').trim()
      if (!fallbackStore) return { effectiveStore: '', forbidden: true }
      return { effectiveStore: fallbackStore, forbidden: false }
    }
    const allowed = input.allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
    if (!allowed) return { effectiveStore: '', forbidden: true }
    return { effectiveStore: storeFilter, forbidden: false }
  }

  const scopeFilter = String(input.scopeFilter || '').trim()
  const departmentFilter = String(input.departmentFilter || '').trim()
  if (scopeFilter === 'office') {
    return {
      effectiveStore: departmentFilter ? `Office-${departmentFilter}` : 'Office',
      forbidden: false,
    }
  }
  if (storeFilter) return { effectiveStore: storeFilter, forbidden: false }
  return { effectiveStore: '', forbidden: false }
}
