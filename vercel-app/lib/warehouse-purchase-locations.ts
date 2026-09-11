export type PurchaseLocationRow = {
  name: string
  address: string
  location_code: string
}

/** 충만 레거시 DB만. Omni는 회사별 warehouse_locations 를 비어 있어도 시드하지 않는다. */
export const CHUNGMAN_FALLBACK_PURCHASE_LOCATIONS: PurchaseLocationRow[] = [
  {
    name: '창고',
    address: 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250',
    location_code: '창고',
  },
]

export function withPurchaseLocationFallback(
  locations: PurchaseLocationRow[],
  tenantEnforce: boolean
): PurchaseLocationRow[] {
  if (locations.length > 0) return locations
  if (tenantEnforce) return []
  return CHUNGMAN_FALLBACK_PURCHASE_LOCATIONS
}
