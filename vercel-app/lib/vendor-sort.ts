export type VendorSortable = {
  name?: string | null
  code?: string | null
}

export type VendorListSortKey = "code" | "type" | "name"
export type VendorListSortDir = "asc" | "desc"

export type VendorListRow = VendorSortable & {
  type?: string | null
  gps_name?: string | null
  sales_outlet?: string | null
}

const vendorListCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true })

/** 거래처 목록에 보이는 이름(매출/둘 다는 gps_name·sales_outlet 우선) */
export function vendorListDisplayName(vendor: VendorListRow): string {
  const type = String(vendor.type || "").trim()
  const gps = String(vendor.gps_name || "").trim()
  const outlet = String(vendor.sales_outlet || "").trim()
  if ((type === "sales" || type === "both") && (gps || outlet)) {
    return gps || outlet
  }
  return String(vendor.name || "").trim()
}

export function compareVendorListRows(
  a: VendorListRow,
  b: VendorListRow,
  key: VendorListSortKey,
  typeLabel: (type: string) => string = (type) => type
): number {
  let diff = 0
  if (key === "code") {
    diff = vendorListCollator.compare(String(a.code || ""), String(b.code || ""))
  } else if (key === "type") {
    diff = vendorListCollator.compare(typeLabel(String(a.type || "")), typeLabel(String(b.type || "")))
    if (diff === 0) {
      diff = vendorListCollator.compare(vendorListDisplayName(a), vendorListDisplayName(b))
    }
  } else {
    diff = vendorListCollator.compare(vendorListDisplayName(a), vendorListDisplayName(b))
  }
  if (diff === 0) {
    diff = vendorListCollator.compare(String(a.code || ""), String(b.code || ""))
  }
  return diff
}

export function sortVendorListRows<T extends VendorListRow>(
  rows: readonly T[],
  key: VendorListSortKey,
  dir: VendorListSortDir,
  typeLabel?: (type: string) => string
): T[] {
  return [...rows].sort((a, b) => {
    const diff = compareVendorListRows(a, b, key, typeLabel)
    return dir === "asc" ? diff : -diff
  })
}

export type VendorColumnFilters = Partial<Record<VendorListSortKey, ReadonlySet<string> | null>>

export function vendorColumnFilterValue(vendor: VendorListRow, key: VendorListSortKey): string {
  if (key === "code") return String(vendor.code || "").trim()
  if (key === "type") return String(vendor.type || "").trim()
  return vendorListDisplayName(vendor)
}

export function applyVendorColumnFilters<T extends VendorListRow>(
  rows: readonly T[],
  filters: VendorColumnFilters
): T[] {
  return rows.filter((row) => {
    for (const key of ["code", "type", "name"] as const) {
      const selected = filters[key]
      if (!selected) continue
      if (!selected.has(vendorColumnFilterValue(row, key))) return false
    }
    return true
  })
}

export function uniqueVendorColumnOptions<T extends VendorListRow>(
  rows: readonly T[],
  key: VendorListSortKey,
  typeLabel?: (type: string) => string
): { value: string; label: string }[] {
  const map = new Map<string, string>()
  for (const row of rows) {
    const value = vendorColumnFilterValue(row, key)
    if (!value || map.has(value)) continue
    map.set(value, key === "type" && typeLabel ? typeLabel(value) : value)
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true }))
}

/** 현재 열을 제외한 필터만 적용한 행 — 엑셀처럼 다른 열 기준으로 선택 목록을 만듦 */
export function vendorColumnOptionRows<T extends VendorListRow>(
  rows: readonly T[],
  filters: VendorColumnFilters,
  key: VendorListSortKey
): T[] {
  return applyVendorColumnFilters(rows, { ...filters, [key]: null })
}

/** 거래처 드롭다운 공통 정렬: 법인명(표시명) 알파벳순, 동명이면 코드순 */
export function compareVendorsByDisplayName(a: VendorSortable, b: VendorSortable): number {
  const aLabel = String(a.name || a.code || '').trim()
  const bLabel = String(b.name || b.code || '').trim()
  const byName = aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base', numeric: true })
  if (byName !== 0) return byName
  return String(a.code || '').localeCompare(String(b.code || ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

export function sortVendorsByDisplayName<T extends VendorSortable>(vendors: readonly T[]): T[] {
  return [...vendors].sort(compareVendorsByDisplayName)
}

export function sortVendorNameStrings(names: readonly string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  )
}
