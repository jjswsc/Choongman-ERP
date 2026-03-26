export type PromoLineLike = {
  menuId: string
  optionId?: string | null
  quantity?: number
}

export type PromoMenuLike = {
  id: string
  price?: number
  /** 메뉴 배달 정가. 없으면 홀 가격과 동일하게 계산 */
  priceDelivery?: number | null
}

export type PromoOptionLike = {
  id: string
  priceModifier?: number
  /** 옵션 배달 추가금. 없으면 홀 추가금과 동일하게 계산 */
  priceModifierDelivery?: number | null
}

export type RegularPriceChannel = 'hall' | 'delivery'

/** 숫자만인 id는 선행 0 제거·정수 통일 (DB/JSON 숫자·문자 혼용 대비) */
function canonicalIdSegment(raw: string): string {
  const s = raw.trim()
  if (/^\d+$/.test(s)) return String(Number(s))
  return s
}

/**
 * 원가 분석·프로모 라인 공통 키. menuId/optionId 공백·타입 불일치를 줄이기 위해 정규화.
 */
export function promoCostKey(
  menuId: string | number | null | undefined,
  optionId?: string | number | null
): string {
  const mid = canonicalIdSegment(String(menuId ?? ""))
  if (!mid) return ":null"
  if (optionId === null || optionId === undefined) {
    return `${mid}:null`
  }
  const o = String(optionId).trim()
  if (o === "" || o.toLowerCase() === "null" || o === "undefined") {
    return `${mid}:null`
  }
  return `${mid}:${canonicalIdSegment(o)}`
}

function parseCostAnalysisAmount(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "number" && Number.isFinite(v)) return v
  const n = parseFloat(String(v).replace(/,/g, "").trim())
  return Number.isFinite(n) ? n : 0
}

export type CostHallDel = { hall: number; del: number }

function mergeCostEntry(target: Record<string, CostHallDel>, key: string, hall: number, del: number) {
  if (del <= 0 && hall > 0) del = hall
  const prev = target[key]
  if (prev == null) {
    target[key] = { hall, del }
  } else {
    const nh = Math.max(prev.hall, hall)
    const nd = Math.max(prev.del, del > 0 ? del : hall)
    target[key] = { hall: nh, del: nd > 0 ? nd : nh }
  }
}

function rowPick(r: Record<string, unknown>, camel: string, snake: string): unknown {
  const a = r[camel]
  if (a !== undefined && a !== null) return a
  return r[snake]
}

/**
 * 원가 분석 API 행 → 조회용 맵
 * - camelCase / snake_case 모두 허용 (프록시·중간 변환 대비)
 * - byMenuKey: promoCostKey(menuId, optionId)
 * - byCodeKey: promoCostKey(메뉴코드 소문자, optionId) — id 불일치 시 폴백
 */
export function buildCostAnalysisLookups(rows: Iterable<unknown>): {
  byMenuKey: Record<string, CostHallDel>
  byCodeKey: Record<string, CostHallDel>
} {
  const byMenuKey: Record<string, CostHallDel> = {}
  const byCodeKey: Record<string, CostHallDel> = {}

  for (const raw of rows) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    const menuId = rowPick(r, "menuId", "menu_id")
    const optionId = rowPick(r, "optionId", "option_id")
    const costHall = rowPick(r, "costHall", "cost_hall")
    const costDelivery = rowPick(r, "costDelivery", "cost_delivery")
    const menuCodeRaw = rowPick(r, "menuCode", "menu_code")

    const mid = String(menuId ?? "").trim()
    if (!mid) continue

    const hall = parseCostAnalysisAmount(costHall)
    let del = parseCostAnalysisAmount(costDelivery)
    const opt = optionId as string | number | null | undefined

    mergeCostEntry(byMenuKey, promoCostKey(mid, opt), hall, del)

    const codeNorm = String(menuCodeRaw ?? "")
      .trim()
      .toLowerCase()
    if (codeNorm) {
      mergeCostEntry(byCodeKey, promoCostKey(codeNorm, opt), hall, del)
    }
  }

  return { byMenuKey, byCodeKey }
}

/** 세트/프로모 UI: menuId 맵 → 없으면 메뉴 코드 맵 */
export function resolveCostFromAnalysisMaps(
  byMenuKey: Record<string, CostHallDel>,
  byCodeKey: Record<string, CostHallDel>,
  menuById: Record<string, { code?: string }>,
  menuId: string,
  optionId: string | null
): CostHallDel | undefined {
  const k = promoCostKey(menuId, optionId)
  if (byMenuKey[k] != null) return byMenuKey[k]
  const menu = menuById[menuId]
  const code = menu?.code?.trim().toLowerCase()
  if (code) {
    const ck = promoCostKey(code, optionId)
    if (byCodeKey[ck] != null) return byCodeKey[ck]
  }
  return undefined
}

/** @deprecated 선호: buildCostAnalysisLookups (코드 키 폴백 없음) */
export function buildCostAnalysisCostMap(rows: Iterable<unknown>): Record<string, CostHallDel> {
  return buildCostAnalysisLookups(rows).byMenuKey
}

export function calcRegularPriceSum(params: {
  items: PromoLineLike[]
  menus: PromoMenuLike[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
  /** 기본 hall. delivery 시 메뉴/옵션의 배달 정가·추가금(없으면 홀과 동일) */
  channel?: RegularPriceChannel
}) {
  const channel = params.channel ?? 'hall'
  let sum = 0
  for (const it of params.items) {
    const menu = params.menus.find((m) => String(m.id) === String(it.menuId))
    const options = params.optionsByMenuId[it.menuId] || []
    const opt = it.optionId
      ? options.find((o) => String(o.id) === String(it.optionId))
      : null
    const hallMenu = menu?.price ?? 0
    const menuUnit =
      channel === 'delivery'
        ? menu != null && menu.priceDelivery != null && Number.isFinite(Number(menu.priceDelivery))
          ? Number(menu.priceDelivery)
          : hallMenu
        : hallMenu
    const hallMod = opt?.priceModifier ?? 0
    const optMod =
      channel === 'delivery'
        ? opt != null && opt.priceModifierDelivery != null && Number.isFinite(Number(opt.priceModifierDelivery))
          ? Number(opt.priceModifierDelivery)
          : hallMod
        : hallMod
    sum += (menuUnit + optMod) * (it.quantity ?? 1)
  }
  return sum
}

export function calcCostTotal(items: PromoLineLike[], costMap: Record<string, number>) {
  let sum = 0
  for (const it of items) {
    sum += (costMap[promoCostKey(it.menuId, it.optionId)] ?? 0) * (it.quantity ?? 1)
  }
  return sum
}

export function calcPromoEconomics(params: {
  regularPriceSum: number
  costTotalHall: number
  costTotalDelivery: number
  salePriceHall: number
  salePriceDelivery?: number
}) {
  const salePrice = Number(params.salePriceHall) || 0
  const salePriceDel =
    params.salePriceDelivery != null ? Number(params.salePriceDelivery) || 0 : salePrice
  const discountAmt = Math.max(0, params.regularPriceSum - salePrice)
  const discountPercent = params.regularPriceSum > 0 ? (discountAmt / params.regularPriceSum) * 100 : 0

  const marginBaht = salePrice - params.costTotalHall
  const marginPercent = salePrice > 0 ? (marginBaht / salePrice) * 100 : 0
  const marginBahtDel = salePriceDel - params.costTotalDelivery
  const marginPercentDel = salePriceDel > 0 ? (marginBahtDel / salePriceDel) * 100 : 0
  const costRateHall = salePrice > 0 ? (params.costTotalHall / salePrice) * 100 : 0
  const costRateDelivery = salePriceDel > 0 ? (params.costTotalDelivery / salePriceDel) * 100 : 0

  return {
    salePrice,
    salePriceDel,
    discountAmt,
    discountPercent,
    marginBaht,
    marginPercent,
    marginBahtDel,
    marginPercentDel,
    costRateHall,
    costRateDelivery,
  }
}

/**
 * 세트 시뮬: 직접 판매가 입력이 유효하면 우선, 아니면 할인 모드(% 또는 바트 차감), 없으면 정가.
 */
export function resolveBundleSalePriceThb(params: {
  regularPriceSum: number
  salePriceDirectStr?: string
  discountPctStr?: string
  discountBahtStr?: string
  discountMode: 'pct' | 'baht'
}): number {
  const reg = Math.max(0, Number(params.regularPriceSum) || 0)
  const directRaw = params.salePriceDirectStr?.trim()
  if (directRaw) {
    const d = Number(directRaw.replace(/,/g, ''))
    if (Number.isFinite(d) && d >= 0) return Math.round(d)
  }
  if (params.discountMode === 'pct') {
    const p = Number(String(params.discountPctStr ?? '').replace(/,/g, ''))
    if (Number.isFinite(p)) return Math.max(0, Math.round(reg * (1 - p / 100)))
  } else {
    const b = Number(String(params.discountBahtStr ?? '').replace(/,/g, ''))
    if (Number.isFinite(b)) return Math.max(0, Math.round(reg - b))
  }
  return Math.round(reg)
}

export function calcPromoSimulation(params: {
  regularPriceSum: number
  costTotal: number
  salePriceInput?: number | null
  discountPercentInput?: number | null
}) {
  const salePriceNum = params.salePriceInput != null ? Number(params.salePriceInput) : null
  const discountNum = params.discountPercentInput != null ? Number(params.discountPercentInput) : null
  const finalSalePrice =
    salePriceNum != null && Number.isFinite(salePriceNum)
      ? salePriceNum
      : discountNum != null && Number.isFinite(discountNum)
        ? params.regularPriceSum * (1 - discountNum / 100)
        : params.regularPriceSum
  const marginBaht = finalSalePrice - params.costTotal
  const marginPercent = finalSalePrice > 0 ? (marginBaht / finalSalePrice) * 100 : 0

  return {
    finalSalePrice,
    marginBaht,
    marginPercent,
  }
}
