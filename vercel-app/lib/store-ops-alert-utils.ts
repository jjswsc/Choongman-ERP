import { attendanceStoreNamePostgrestVariantsFilter } from '@/lib/attendance-utils'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

/** PostgREST store_name — 허용 매장(OR) 필터. 빈 배열이면 필터 없음(본사 전체). */
export function storeOpsStoreNameScopePostgrestFilter(allowedStores: string[]): string {
  const stores = [...new Set(allowedStores.map((s) => String(s || '').trim()).filter(Boolean))]
  if (stores.length === 0) return ''
  const inner: string[] = []
  for (const store of stores) {
    const f = attendanceStoreNamePostgrestVariantsFilter(store)
    if (!f) continue
    if (f.startsWith('or=(')) {
      inner.push(f.slice(4, -1))
    } else {
      inner.push(f)
    }
  }
  if (inner.length === 0) return ''
  if (inner.length === 1) return inner[0]
  return `or=(${inner.join(',')})`
}

export function storeOpsStoreInScope(
  storeName: string,
  allowedStores: string[],
  officeScope: boolean
): boolean {
  if (officeScope) return true
  const sn = String(storeName || '').trim()
  if (!sn) return false
  return allowedStores.some((a) => storesMatchForGradeLookup(a, sn))
}

export function storeOpsIsStoreCheckedToday(
  operationalStore: string,
  checkedStoreNames: Iterable<string>
): boolean {
  const target = String(operationalStore || '').trim()
  if (!target) return false
  for (const checked of checkedStoreNames) {
    if (storesMatchForGradeLookup(checked, target)) return true
  }
  return false
}
