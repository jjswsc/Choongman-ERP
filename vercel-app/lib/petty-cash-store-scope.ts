import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export type PettyCashStoreScopeInput = {
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore: string
  userRole: string
  allowedStores: string[]
}

/** getPettyCashList / getPettyCashSummary 공통 매장·본사 범위 */
export function resolvePettyCashEffectiveStore(input: PettyCashStoreScopeInput): {
  effectiveStore: string
  forbidden: boolean
} {
  let storeFilter = String(input.storeFilter || '').trim()
  if (storeFilter === 'undefined' || storeFilter === 'null' || storeFilter === 'All') storeFilter = ''

  const userRole = String(input.userRole || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)

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
