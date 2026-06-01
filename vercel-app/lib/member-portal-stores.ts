import type { ErpStoreMasterRow } from '@/lib/erp-store-master'

export type MemberPortalStoreDto = {
  storeCode: string
  displayName: string
  address: string
  mapQuery: string
  photoUrl: string
  sortOrder: number
  isActive: boolean
}

export function defaultMemberPortalMapQuery(displayName: string): string {
  const name = String(displayName || '').trim()
  return name ? `Choongman Chicken ${name}` : 'Choongman Chicken'
}

export function mapErpStoreToMemberPortal(row: ErpStoreMasterRow): MemberPortalStoreDto | null {
  const storeCode = String(row.store_code || '').trim()
  if (!storeCode) return null
  const displayName = String(row.display_name || '').trim() || storeCode
  const address = String(row.address || '').trim()
  const mapQueryRaw = String(row.map_query || '').trim()
  const photoUrl = String(row.photo_url || '').trim()
  return {
    storeCode,
    displayName,
    address,
    mapQuery: mapQueryRaw || defaultMemberPortalMapQuery(displayName),
    photoUrl,
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
  }
}

export function memberPortalStoresFromMasters(rows: ErpStoreMasterRow[]): MemberPortalStoreDto[] {
  return rows
    .map(mapErpStoreToMemberPortal)
    .filter((s): s is MemberPortalStoreDto => Boolean(s))
    .filter((s) => s.isActive)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.displayName.localeCompare(b.displayName, 'ko')
    })
}

export function memberPortalStoreMatchesQuery(store: MemberPortalStoreDto, query: string): boolean {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const hay = `${store.displayName} ${store.storeCode} ${store.address} ${store.mapQuery}`.toLowerCase()
  return hay.includes(q)
}
