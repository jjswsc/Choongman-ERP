/**
 * 직접정산 거래처 - 서버 전용 (API routes)
 * - 본사 재고·입출고 제외, 회계(미수금) 제외
 */
import { supabaseSelectFilter } from './supabase-server'

let cachedCodes: Set<string> | null = null
/** 직접정산 거래처 식별자 집합 (code, name, gps_name - items.vendor에 이름이 저장된 경우 대비) */
let cachedIdentifiers: Set<string> | null = null

/** 직접정산 캐시 초기화 (saveVendor 등 거래처 수정 시 호출) */
export function clearDirectSettlementCache(): void {
  cachedCodes = null
  cachedIdentifiers = null
}

/** 직접정산 거래처 코드 목록 (캐시) */
export async function getDirectSettlementVendorCodes(): Promise<Set<string>> {
  if (cachedCodes) return cachedCodes
  await loadDirectSettlementCache()
  return cachedCodes ?? new Set()
}

/** 직접정산 거래처 식별자(code, name, gps_name) - 이름으로 저장된 경우 매칭용 */
async function getDirectSettlementIdentifiers(): Promise<Set<string>> {
  if (cachedIdentifiers) return cachedIdentifiers
  await loadDirectSettlementCache()
  return cachedIdentifiers ?? new Set()
}

function loadDirectSettlementCache(): Promise<void> {
  if (cachedCodes && cachedIdentifiers) return Promise.resolve()
  return supabaseSelectFilter(
    'vendors',
    'direct_settlement=eq.true',
    { select: 'code,name,gps_name', limit: 500 }
  )
    .then((rows) => {
      const codes = new Set<string>()
      const identifiers = new Set<string>()
      for (const r of (rows || []) as { code?: string; name?: string; gps_name?: string }[]) {
        const c = String(r.code || '').trim()
        const n = String(r.name || '').trim()
        const g = String(r.gps_name || '').trim()
        if (c) {
          codes.add(c)
          identifiers.add(c)
        }
        if (n) identifiers.add(n)
        if (g) identifiers.add(g)
      }
      cachedCodes = codes
      cachedIdentifiers = identifiers
    })
    .catch(() => {
      cachedCodes = new Set()
      cachedIdentifiers = new Set()
    })
}

/** 품목의 거래처 코드 조회 (items.vendor 또는 item_vendors) */
export async function getItemVendorCode(itemCode: string): Promise<string | null> {
  if (!itemCode?.trim()) return null
  const code = String(itemCode).trim()
  try {
    const itemRows = (await supabaseSelectFilter(
      'items',
      `code=eq.${encodeURIComponent(code)}`,
      { select: 'vendor', limit: 1 }
    )) as { vendor?: string }[] | null
    const vendor = itemRows?.[0]?.vendor
    if (vendor && String(vendor).trim()) return String(vendor).trim()

    const ivRows = (await supabaseSelectFilter(
      'item_vendors',
      `item_code=eq.${encodeURIComponent(code)}`,
      { select: 'vendor_code', order: 'priority.desc', limit: 1 }
    )) as { vendor_code?: string }[] | null
    const vc = ivRows?.[0]?.vendor_code
    if (vc && String(vc).trim()) return String(vc).trim()
    return null
  } catch {
    return null
  }
}

/** 품목이 직접정산 거래처 소속인지 */
export async function isDirectSettlementItem(itemCode: string): Promise<boolean> {
  const vendorCode = await getItemVendorCode(itemCode)
  if (!vendorCode) return false
  const directCodes = await getDirectSettlementVendorCodes()
  return directCodes.has(vendorCode)
}

/** 품목 코드 목록 → 직접정산 여부 맵 (배치 조회) */
export async function getDirectSettlementMap(
  itemCodes: string[]
): Promise<Record<string, boolean>> {
  const identifiers = await getDirectSettlementIdentifiers()
  if (identifiers.size === 0) return {}
  const result: Record<string, boolean> = {}
  const unique = [...new Set(itemCodes.map((c) => String(c || '').trim()).filter(Boolean))]
  for (const code of unique) {
    const vendorRef = await getItemVendorCode(code)
    // vendorRef: items.vendor 또는 item_vendors.vendor_code (코드 또는 이름일 수 있음)
    result[code] = !!(vendorRef && identifiers.has(vendorRef))
  }
  return result
}
