/** 품목 행 → 1g당 또는 1ea당 원가 (판매가 기준, 총 수량 있으면 환산) */
export function getItemCostPerUnit(
  item: { cost?: number; price?: number; total_quantity?: number | null; unit?: string },
  isPackaging: boolean
): number {
  const price = Number(item.price ?? item.cost ?? 0)
  const totalQty = item.total_quantity != null ? Number(item.total_quantity) : null
  const u = String(item.unit ?? "").toLowerCase().trim()

  if (totalQty != null && totalQty > 0 && price >= 0) {
    const costPerStdUnit = price / totalQty
    if (isPackaging) return costPerStdUnit
    if (u === "g" || u === "ml") return costPerStdUnit
    if (u === "kg") return costPerStdUnit / 1000
    if (u === "l") return costPerStdUnit / 1000
    if (u === "oz") return costPerStdUnit / 28.35
    if (u === "lb") return costPerStdUnit / 453.6
    if (/개|ea|팩|pack|박스/.test(u)) return costPerStdUnit
    return costPerStdUnit
  }
  return Number(item.cost ?? 0)
}

/** getItemCostPerUnit 단가가 가리키는 단위 표시 (kg→g, l→ml) */
export function getItemBomUnitLabel(unit: string | undefined, isPackaging: boolean): string {
  const raw = String(unit ?? "").trim()
  if (isPackaging) return raw
  const u = raw.toLowerCase()
  if (u === "kg" || u === "oz" || u === "lb") return "g"
  if (u === "l") return "ml"
  return raw
}

/**
 * 재고(stock_logs) 수량 1 = BOM 수량 단위(g·ml·ea) 몇 개.
 * 재고는 입고 단위(박스·팩)로, BOM 은 getItemCostPerUnit 단가 기준 단위로 쌓이므로 비교 전에 곱한다.
 */
export function getItemBomUnitsPerStockUnit(
  item: { cost?: number; price?: number; total_quantity?: number | null; unit?: string },
  isPackaging: boolean
): number {
  const price = Number(item.price ?? item.cost ?? 0)
  const totalQty = item.total_quantity != null ? Number(item.total_quantity) : null
  const u = String(item.unit ?? "").toLowerCase().trim()
  if (totalQty != null && totalQty > 0 && price >= 0) {
    if (isPackaging) return totalQty
    if (u === "kg" || u === "l") return totalQty * 1000
    if (u === "oz") return totalQty * 28.35
    if (u === "lb") return totalQty * 453.6
    return totalQty
  }
  return 1
}
