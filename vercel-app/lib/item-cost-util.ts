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
