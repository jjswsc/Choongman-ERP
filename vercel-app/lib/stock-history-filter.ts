/** 재고 사용·조정 이력·현재 재고 목록 공통 클라이언트 필터 */
export type StockViewKind = 'usage' | 'adjustment' | 'list'
/** @deprecated StockViewKind 사용 */
export type StockHistoryKind = StockViewKind

export interface StockHistoryFilterableRow {
  item: string
  itemCode?: string
  category?: string
}

export interface StockListFilterableRow {
  code: string
  name: string
  category?: string
}

export function filterStockHistoryRows<T extends StockHistoryFilterableRow>(
  rows: T[],
  categoryFilter: string,
  searchTerm: string
): T[] {
  let result = rows
  if (categoryFilter && categoryFilter !== '__all__') {
    result = result.filter((r) => (r.category || '').trim() === categoryFilter)
  }
  const q = searchTerm.trim().toLowerCase()
  if (q) {
    result = result.filter(
      (r) =>
        r.item.toLowerCase().includes(q) ||
        (r.itemCode || '').toLowerCase().includes(q)
    )
  }
  return result
}

export function filterStockListRows<T extends StockListFilterableRow>(
  rows: T[],
  categoryFilter: string,
  searchTerm: string
): T[] {
  let result = rows
  if (categoryFilter && categoryFilter !== '__all__') {
    result = result.filter((r) => (r.category || '').trim() === categoryFilter)
  }
  const q = searchTerm.trim().toLowerCase()
  if (q) {
    result = result.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    )
  }
  return result
}

export function collectCategoryOptions(
  rows: StockHistoryFilterableRow[],
  extra: string[] = []
): string[] {
  const cats = new Set<string>()
  for (const c of extra) {
    const t = c.trim()
    if (t) cats.add(t)
  }
  for (const r of rows) {
    const c = (r.category || '').trim()
    if (c) cats.add(c)
  }
  return Array.from(cats).sort()
}
