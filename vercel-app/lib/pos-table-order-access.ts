const TABLE_ORDER_STORES_ENV =
  process.env.NEXT_PUBLIC_POS_TABLE_ORDER_STORES ??
  process.env.POS_TABLE_ORDER_STORES ??
  ''

function normalizeStoreCode(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

const ENABLED_TABLE_ORDER_STORES = new Set(
  TABLE_ORDER_STORES_ENV.split(',')
    .map((s) => normalizeStoreCode(s))
    .filter(Boolean)
)

/**
 * 테이블 오더 전용 매장 판별.
 * - NEXT_PUBLIC_POS_TABLE_ORDER_STORES 또는 POS_TABLE_ORDER_STORES(콤마 구분) 사용
 * - 값이 비어 있으면 기본적으로 미허용(기존 POS 화면 보호)
 */
export function isPosTableOrderEnabledStore(storeCode: string | null | undefined): boolean {
  const code = normalizeStoreCode(storeCode)
  if (!code) return false
  return ENABLED_TABLE_ORDER_STORES.has(code)
}

export function getEnabledPosTableOrderStores(): string[] {
  return [...ENABLED_TABLE_ORDER_STORES]
}
