import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { toPosCostSalesDenom, type PosCostVatView } from "@/lib/pos-cost-vat"

/** 목록·KPI 공통 — 원가율 구간 (%) */
export const COST_RATIO_GOOD_MAX = 35
export const COST_RATIO_CAUTION_MAX = 42

export type CostRatioTier = "good" | "caution" | "danger" | "na"

export type PosCostIssueKind = "zero_cost" | "no_bom" | "high_ratio"

export type PosCostListSettings = {
  misePercent: number
  costRatioGoodMax: number
  costRatioCautionMax: number
  categoryTargets: Record<string, number>
}

export const DEFAULT_POS_COST_LIST_SETTINGS: PosCostListSettings = {
  /** 전역 미즈는 사용하지 않음 — 재료별 loss_rate만 반영 */
  misePercent: 0,
  costRatioGoodMax: COST_RATIO_GOOD_MAX,
  costRatioCautionMax: COST_RATIO_CAUTION_MAX,
  categoryTargets: {},
}

export function costRatioTier(
  ratioPct: number,
  settings: Pick<PosCostListSettings, "costRatioGoodMax" | "costRatioCautionMax"> = DEFAULT_POS_COST_LIST_SETTINGS
): CostRatioTier {
  if (!Number.isFinite(ratioPct) || ratioPct <= 0) return "na"
  if (ratioPct <= settings.costRatioGoodMax) return "good"
  if (ratioPct <= settings.costRatioCautionMax) return "caution"
  return "danger"
}

export function costRatioTierClass(tier: CostRatioTier): string {
  switch (tier) {
    case "good":
      return "text-emerald-600 dark:text-emerald-400"
    case "caution":
      return "text-amber-600 dark:text-amber-400"
    case "danger":
      return "text-rose-600 dark:text-rose-400"
    default:
      return "text-muted-foreground"
  }
}

export function costRatioTierBgClass(tier: CostRatioTier): string {
  switch (tier) {
    case "good":
      return "bg-emerald-500/10 border-emerald-500/30"
    case "caution":
      return "bg-amber-500/10 border-amber-500/30"
    case "danger":
      return "bg-rose-500/10 border-rose-500/30"
    default:
      return "bg-muted/30 border-border"
  }
}

export type PosCostRowMetrics = {
  priceH: number
  priceD: number
  /** VAT 제외 매출 — 원가율·마진 분모(배달앱 수수료 미차감) */
  netSalesH: number
  netSalesD: number
  costHMise: number
  costDMise: number
  costRatioH: number
  costRatioD: number
  marginH: number
  marginD: number
  marginPctH: number
  marginPctD: number
  tierH: CostRatioTier
  tierD: CostRatioTier
  issues: PosCostIssueKind[]
}

export function computePosCostRowMetrics(
  r: PosMenuCostAnalysisRow,
  _misePercent: number = 0,
  cautionMax: number = COST_RATIO_CAUTION_MAX,
  vatView: PosCostVatView = "excluded"
): PosCostRowMetrics {
  const roundCost = (c: number) => Math.round(c * 10) / 10
  const priceH = Number(r.priceHall ?? 0)
  const priceD = Number(r.priceDelivery ?? r.priceHall ?? 0)
  const costHMise = roundCost(r.costHall ?? 0)
  const costDMise = roundCost(r.costDelivery ?? 0)
  const vatIncluded = r.vatIncluded !== false

  const netHall = toPosCostSalesDenom(priceH, vatIncluded, vatView)
  const netDel = toPosCostSalesDenom(priceD, vatIncluded, vatView)

  const marginH = netHall - costHMise
  const marginD = netDel - costDMise
  const marginPctH = netHall > 0 ? (marginH / netHall) * 100 : 0
  const marginPctD = netDel > 0 ? (marginD / netDel) * 100 : 0

  /** 원가율 = 원가(공급가) ÷ 매출(VAT 보기 기준) — 배달앱 수수료는 분모에서 제외 */
  const costRatioH = netHall > 0 ? (costHMise / netHall) * 100 : 0
  const costRatioD = netDel > 0 ? (costDMise / netDel) * 100 : 0

  const issues: PosCostIssueKind[] = []
  const hasBom =
    typeof r.hasBom === "boolean" ? r.hasBom : (r.breakdown ?? []).length > 0
  if (!hasBom && costHMise <= 0 && costDMise <= 0) issues.push("no_bom")
  else if (costHMise <= 0 && costDMise <= 0) issues.push("zero_cost")
  if (costRatioH > cautionMax || costRatioD > cautionMax) {
    issues.push("high_ratio")
  }

  return {
    priceH,
    priceD,
    netSalesH: netHall,
    netSalesD: netDel,
    costHMise,
    costDMise,
    costRatioH,
    costRatioD,
    marginH,
    marginD,
    marginPctH,
    marginPctD,
    tierH: costRatioTier(costRatioH),
    tierD: costRatioTier(costRatioD),
    issues,
  }
}

/** 목록·KPI — BOM 합계(재료별 loss_rate 포함) 그대로 반환 */
export function applyPosCostListMise(base: number, _misePercent: number = 0): number {
  return Math.round(base * 10) / 10
}

export type PosCostListSummary = {
  n: number
  nHall: number
  nDelivery: number
  avgPriceH: number
  avgPriceD: number
  avgCostH: number
  avgCostD: number
  avgRatioH: number
  avgRatioD: number
  avgMarginH: number
  avgMarginD: number
  issueZeroCost: number
  issueNoBom: number
  issueHighRatio: number
}

export function summarizePosCostRows(
  rows: PosMenuCostAnalysisRow[],
  misePercent: number = 0,
  cautionMax: number = COST_RATIO_CAUTION_MAX,
  vatView: PosCostVatView = "excluded"
): PosCostListSummary | null {
  if (rows.length === 0) return null
  const metrics = rows.map((r) => computePosCostRowMetrics(r, misePercent, cautionMax, vatView))
  const rowsH = metrics.filter((m) => m.costRatioH > 0)
  const rowsD = metrics.filter((m) => m.costRatioD > 0)
  const nH = rowsH.length
  const nD = rowsD.length

  let sumPriceH = 0
  let sumPriceD = 0
  let sumNetH = 0
  let sumNetD = 0
  let sumCostH = 0
  let sumCostD = 0
  let sumMarginH = 0
  let sumMarginD = 0
  for (let i = 0; i < rows.length; i++) {
    const m = metrics[i]!
    if (m.costRatioH > 0) {
      sumPriceH += m.priceH
      sumNetH += m.netSalesH
      sumCostH += m.costHMise
      sumMarginH += m.marginH
    }
    if (m.costRatioD > 0) {
      sumPriceD += m.priceD
      sumNetD += m.netSalesD
      sumCostD += m.costDMise
      sumMarginD += m.marginD
    }
  }

  const avgPriceH = nH > 0 ? sumPriceH / nH : 0
  const avgCostH = nH > 0 ? sumCostH / nH : 0
  const avgPriceD = nD > 0 ? sumPriceD / nD : 0
  const avgCostD = nD > 0 ? sumCostD / nD : 0
  const avgNetH = nH > 0 ? sumNetH / nH : 0
  const avgNetD = nD > 0 ? sumNetD / nD : 0
  const avgRatioH = avgNetH > 0 ? (avgCostH / avgNetH) * 100 : 0
  const avgRatioD = avgNetD > 0 ? (avgCostD / avgNetD) * 100 : 0
  const avgMarginH = nH > 0 ? sumMarginH / nH : 0
  const avgMarginD = nD > 0 ? sumMarginD / nD : 0

  let issueZeroCost = 0
  let issueNoBom = 0
  let issueHighRatio = 0
  for (const m of metrics) {
    if (m.issues.includes("zero_cost")) issueZeroCost++
    if (m.issues.includes("no_bom")) issueNoBom++
    if (m.issues.includes("high_ratio")) issueHighRatio++
  }

  return {
    n: rows.length,
    nHall: nH,
    nDelivery: nD,
    avgPriceH,
    avgPriceD,
    avgCostH,
    avgCostD,
    avgRatioH,
    avgRatioD,
    avgMarginH,
    avgMarginD,
    issueZeroCost,
    issueNoBom,
    issueHighRatio,
  }
}

export type PosCostIssueFilter = "all" | "zero_cost" | "no_bom" | "high_ratio"

/** 목록 판매 상태 필터 — 기본값 active(판매중) */
export type PosCostSaleFilter = "active" | "all" | "inactive"

export function rowMatchesSaleFilter(
  row: Pick<PosMenuCostAnalysisRow, "isActive">,
  filter: PosCostSaleFilter
): boolean {
  if (filter === "all") return true
  const active = row.isActive !== false
  return filter === "active" ? active : !active
}

export function rowMatchesIssueFilter(
  r: PosMenuCostAnalysisRow,
  filter: PosCostIssueFilter,
  misePercent: number = 0,
  cautionMax: number = COST_RATIO_CAUTION_MAX,
  vatView: PosCostVatView = "excluded"
): boolean {
  if (filter === "all") return true
  return computePosCostRowMetrics(r, misePercent, cautionMax, vatView).issues.includes(filter)
}

/** 품목 코드 → 사용 메뉴 수 (breakdown 필요) */
export function countMenusUsingItemCode(
  rows: PosMenuCostAnalysisRow[],
  itemCode: string
): { count: number; menuLabels: string[] } {
  const code = itemCode.trim().toLowerCase()
  if (!code) return { count: 0, menuLabels: [] }
  const labels: string[] = []
  for (const r of rows) {
    const breakdown = r.breakdown ?? []
    const hit = breakdown.some((b) => String(b.itemCode ?? "").trim().toLowerCase() === code)
    if (hit) {
      labels.push(`${r.menuCode ?? r.menuId}${r.optionName ? ` (${r.optionName})` : ""}`)
    }
  }
  return { count: labels.length, menuLabels: labels }
}

/** what-if: 품목 단가 +deltaPct% 반영 시 행별 원가율 변화 */
export function simulateItemPriceDelta(
  rows: PosMenuCostAnalysisRow[],
  itemCode: string,
  deltaPct: number,
  _misePercent: number = 0,
  vatView: PosCostVatView = "excluded"
): Array<{
  row: PosMenuCostAnalysisRow
  beforeRatioH: number
  afterRatioH: number
  deltaRatioH: number
}> {
  const code = itemCode.trim().toLowerCase()
  if (!code || deltaPct === 0) return []
  const mult = 1 + deltaPct / 100
  const out: Array<{
    row: PosMenuCostAnalysisRow
    beforeRatioH: number
    afterRatioH: number
    deltaRatioH: number
  }> = []

  for (const r of rows) {
    const breakdown = r.breakdown ?? []
    const lines = breakdown.filter((b) => String(b.itemCode ?? "").trim().toLowerCase() === code)
    if (lines.length === 0) continue

    const before = computePosCostRowMetrics(r, _misePercent, COST_RATIO_CAUTION_MAX, vatView)
    let addedCost = 0
    for (const line of lines) {
      const base = Number(line.costTotal ?? 0)
      addedCost += base * (mult - 1)
    }
    const afterCostH = before.costHMise + addedCost
    const afterRatioH = before.netSalesH > 0 ? (afterCostH / before.netSalesH) * 100 : 0
    out.push({
      row: r,
      beforeRatioH: before.costRatioH,
      afterRatioH,
      deltaRatioH: afterRatioH - before.costRatioH,
    })
  }
  return out.sort((a, b) => b.deltaRatioH - a.deltaRatioH)
}

export function exportPosCostListCsv(
  rows: Array<PosMenuCostAnalysisRow & { displayCode?: string }>,
  _misePercent: number = 0,
  vatView: PosCostVatView = "excluded"
): string {
  const header = [
    "code",
    "main_category",
    "category",
    "menu_name",
    "option_name",
    "price_hall",
    "price_delivery",
    "cost_hall",
    "cost_delivery",
    "cost_ratio_hall_pct",
    "cost_ratio_delivery_pct",
    "margin_hall",
    "margin_delivery",
    "cooking_time_min",
  ]
  const lines = [header.join(",")]
  for (const r of rows) {
    const m = computePosCostRowMetrics(r, _misePercent, COST_RATIO_CAUTION_MAX, vatView)
    const displayCode = (r as { displayCode?: string }).displayCode ?? r.menuCode ?? ""
    const cells = [
      displayCode,
      r.categoryMain ?? "",
      r.category ?? "",
      r.menuName ?? "",
      r.optionName ?? "",
      m.priceH.toFixed(2),
      m.priceD.toFixed(2),
      m.costHMise.toFixed(2),
      m.costDMise.toFixed(2),
      m.costRatioH.toFixed(1),
      m.costRatioD.toFixed(1),
      m.marginH.toFixed(2),
      m.marginD.toFixed(2),
      r.cookingTimeMin != null ? String(r.cookingTimeMin) : "",
    ]
    lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
  }
  return lines.join("\n")
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const POS_COST_SESSION_KEY = "cm-pos-cost-analysis-rows-v1"

export function readPosCostSessionCache(): { rows: PosMenuCostAnalysisRow[]; at: string } | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(POS_COST_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { rows?: unknown; at?: string }
    if (!Array.isArray(parsed.rows) || !parsed.at) return null
    return { rows: parsed.rows as PosMenuCostAnalysisRow[], at: parsed.at }
  } catch {
    return null
  }
}

export function writePosCostSessionCache(rows: PosMenuCostAnalysisRow[]) {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(
      POS_COST_SESSION_KEY,
      JSON.stringify({ rows, at: new Date().toISOString() })
    )
  } catch {
    /* ignore quota */
  }
}

/** 계산기 What-if: 선택 품목 단가 변동 시 음식·포장 원가 증분(฿) */
export function simulateRecipeLineCostDelta(
  lines: Array<{ itemCode: string; lineCost: number }>,
  itemCode: string,
  deltaPct: number
): number {
  const code = itemCode.trim().toLowerCase()
  if (!code || deltaPct === 0) return 0
  const mult = deltaPct / 100
  let delta = 0
  for (const line of lines) {
    if (String(line.itemCode ?? "").trim().toLowerCase() !== code) continue
    delta += line.lineCost * mult
  }
  return delta
}
