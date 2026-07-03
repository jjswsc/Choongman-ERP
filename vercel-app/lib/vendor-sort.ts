export type VendorSortable = {
  name?: string | null
  code?: string | null
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
