import { buildLegacyToCanonicalMap, type ErpStoreMasterRow } from '@/lib/erp-store-master-shared'
import { resolveErpStoreCodeFromGrabMap } from '@/lib/grab-store-map-env'
import { isPosSalesTestOfficeStoreCode } from '@/lib/pos-sales-test-office'
import { normStoreKey } from '@/lib/store-list-keys'

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

const GENERIC_MEMBER_PORTAL_MAP_QUERIES = new Set([
  'choongman chicken',
  'choongman',
  'chungman chicken',
  '충만',
  '충만치킨',
])

function isGenericMemberPortalMapQuery(mapQuery: string): boolean {
  const norm = String(mapQuery || '').trim().toLowerCase()
  return !norm || GENERIC_MEMBER_PORTAL_MAP_QUERIES.has(norm)
}

function mapQueryMentionsStoreName(mapQuery: string, displayName: string): boolean {
  const q = String(mapQuery || '').trim().toLowerCase()
  const dn = String(displayName || '').trim().toLowerCase()
  if (!q || !dn) return false
  if (q.includes(dn)) return true
  return dn
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .some((part) => q.includes(part))
}

/** 회원앱 매장탭 — 클릭한 매장 1곳만 Google Maps에 표시되도록 검색어 구성 */
export function memberPortalGoogleMapsSearchQuery(
  store: Pick<MemberPortalStoreDto, 'displayName' | 'address' | 'mapQuery'>
): string {
  const displayName = String(store.displayName || '').trim()
  const address = String(store.address || '').trim()
  const mapQuery = String(store.mapQuery || '').trim()
  const storeDefaultQuery = defaultMemberPortalMapQuery(displayName)

  if (address) {
    return displayName ? `${displayName}, ${address}` : address
  }

  if (mapQuery && !isGenericMemberPortalMapQuery(mapQuery) && mapQueryMentionsStoreName(mapQuery, displayName)) {
    return mapQuery
  }

  return storeDefaultQuery
}

export function memberPortalGoogleMapsUrl(
  store: Pick<MemberPortalStoreDto, 'displayName' | 'address' | 'mapQuery'>
): string {
  const q = encodeURIComponent(memberPortalGoogleMapsSearchQuery(store))
  return `https://www.google.com/maps/search/?api=1&query=${q}`
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

/** 회원앱 공개 매장 — test·본사(hq/office) 등 비운영 매장 제외 */
export function isMemberPortalPublicStore(
  store: Pick<MemberPortalStoreDto, 'storeCode' | 'displayName'>
): boolean {
  if (isPosSalesTestOfficeStoreCode(store.storeCode)) return false
  if (isPosSalesTestOfficeStoreCode(store.displayName)) return false
  return true
}

function isGrabPartnerNumericId(storeCode: string): boolean {
  return /^\d{3,6}$/.test(String(storeCode || '').trim())
}

function resolveMemberPortalStoreCanonicalKey(
  storeCode: string,
  legacyToCanonical: Record<string, string>
): string {
  const code = String(storeCode || '').trim()
  if (!code) return code

  const fromLegacy = legacyToCanonical[normStoreKey(code)]
  if (fromLegacy && fromLegacy !== code) return fromLegacy

  const fromGrab = resolveErpStoreCodeFromGrabMap(code)
  if (fromGrab && fromGrab !== code && !isGrabPartnerNumericId(fromGrab)) return fromGrab

  return code
}

function pickPrimaryMemberPortalStore(members: MemberPortalStoreDto[]): MemberPortalStoreDto {
  return members.reduce((best, cur) => {
    const bestNum = isGrabPartnerNumericId(best.storeCode)
    const curNum = isGrabPartnerNumericId(cur.storeCode)
    if (bestNum && !curNum) return cur
    if (!bestNum && curNum) return best
    if (cur.sortOrder !== best.sortOrder) return cur.sortOrder < best.sortOrder ? cur : best
    return cur.displayName.localeCompare(best.displayName, 'ko') < 0 ? cur : best
  })
}

export function memberPortalStoresFromMasters(
  rows: ErpStoreMasterRow[],
  opts?: { orderStoreFilter?: (store: MemberPortalStoreDto) => boolean }
): MemberPortalStoreDto[] {
  const include = opts?.orderStoreFilter ?? isMemberPortalPublicStore
  const legacyToCanonical = buildLegacyToCanonicalMap(rows)
  const mapped = rows
    .map(mapErpStoreToMemberPortal)
    .filter((s): s is MemberPortalStoreDto => Boolean(s))
    .filter((s) => s.isActive)
    .filter((s) => include(s))

  if (mapped.length <= 1) {
    return mapped.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.displayName.localeCompare(b.displayName, 'ko')
    })
  }

  const groups = new Map<string, MemberPortalStoreDto[]>()
  for (const store of mapped) {
    const canonical = resolveMemberPortalStoreCanonicalKey(store.storeCode, legacyToCanonical)
    const g = groups.get(canonical) || []
    g.push(store)
    groups.set(canonical, g)
  }

  const result: MemberPortalStoreDto[] = []
  for (const members of groups.values()) {
    result.push(pickPrimaryMemberPortalStore(members))
  }

  return result.sort((a, b) => {
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
