/** 거래처 vendors.type — DB는 TEXT, 앱 유니온 */
export type VendorKind = 'purchase' | 'sales' | 'both' | 'related'

export function isRelatedVendorType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase().trim()
  return t === 'related' || t === '관련당사자'
}

export function mapVendorType(v: string | null | undefined): VendorKind {
  const lower = String(v || '').toLowerCase().trim()
  if (isRelatedVendorType(lower)) return 'related'
  if (lower === 'sales' || lower === '매출' || lower === '매출처') return 'sales'
  if (lower === 'both' || lower === '둘 다') return 'both'
  return 'purchase'
}

export function mapVendorTypeToDb(type: string | null | undefined): string {
  const t = String(type || '').toLowerCase().trim()
  if (t === 'sales') return 'sales'
  if (t === 'both') return 'both'
  if (t === 'related') return 'related'
  return 'purchase'
}

export function isPurchasePickerVendorType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase().trim()
  if (t === '매출' || t === 'sales' || t === '매출처') return false
  if (isRelatedVendorType(t)) return false
  return true
}
