/**
 * POS 메뉴 원가·재료·원가감사 API — pos-menus.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { parsePosMutationResponse } from './helpers'

export interface PosMenuIngredient {
  id: string
  menuId: string
  itemCode: string
  ingredientType?: 'food' | 'packaging'
  quantity: number
  lossRate?: number
  optionId?: string | null
  /** 원가 계산기 입력 단위 (g::1, kg::1000 등) */
  quantityUnitKey?: string
}

export async function getPosMenuIngredients(
  params: { menuId: string; optionId?: string },
  opts?: { requireOnline?: boolean }
) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const url = '/api/getPosMenuIngredients?' + q.toString()
  const res = opts?.requireOnline ? await apiFetch(url) : await apiFetchWithOffline(url)
  if (opts?.requireOnline && !res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(err.message || `재료 조회 실패 (${res.status})`)
  }
  return jsonAsArray<PosMenuIngredient>(await res.json())
}

export async function savePosMenuIngredient(
  params: {
    id?: string
    menuId: number
    itemCode: string
    quantity?: number
    lossRate?: number
    optionId?: number | null
    ingredientType?: 'food' | 'packaging'
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenuIngredient', init)
    : await apiFetchWithOffline('/api/savePosMenuIngredient', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function replacePosMenuIngredients(
  params: {
    menuId: number
    optionId?: number | null
    items: Array<{
      itemCode: string
      quantity: number
      lossRate?: number
      ingredientType?: 'food' | 'packaging'
      quantityUnitKey?: string | null
    }>
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/replacePosMenuIngredients', init)
    : await apiFetchWithOffline('/api/replacePosMenuIngredients', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string; deleted?: number; inserted?: number }>
}

export interface MenuCostBreakdown {
  itemCode: string
  itemName: string
  unit?: string
  quantity: number
  lossRate: number
  costPerUnit: number
  costTotal: number
  source?: 'hq' | 'store'
  ingredientType?: 'food' | 'packaging'
  quantityUnitKey?: string
}

export async function getMenuCost(params: { menuId: string; optionId?: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const res = await apiFetch('/api/getMenuCost?' + q.toString())
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }
  }
  const o = raw as Record<string, unknown>
  const cost = Number(o.cost) || 0
  return {
    cost,
    costHall: Number(o.costHall) || cost,
    costDelivery: Number(o.costDelivery) || cost,
    breakdown: jsonAsArray<MenuCostBreakdown>(o.breakdown),
  }
}

export interface PosMenuCostAnalysisRow {
  menuId: string
  menuCode: string
  menuName: string
  category: string
  categoryMain?: string
  priceHall: number
  priceDelivery: number | null
  /** 가격이 VAT 포함인지 (false면 이미 VAT 제외) */
  vatIncluded?: boolean
  optionId: string | null
  optionCode?: string | null
  optionName: string | null
  optionType?: 'substitution' | 'additive' | null
  costHall: number
  costDelivery: number
  cookingTimeMin?: number | null
  /** 배달앱 수수료(%) — null이면 UI 기본 20% */
  deliveryAppFeePercent?: number | null
  /** pos_menus.is_active — false면 미판매(비활성) */
  isActive?: boolean
  /**
   * summary=1 응답용 — breakdown 비우기 전 BOM 존재 여부.
   * 없으면 breakdown.length 로 판정.
   */
  hasBom?: boolean
  breakdown: {
    itemCode: string
    itemName: string
    unit: string
    costPerUnit: number
    quantity: number
    lossRate: number
    costTotal: number
    source: 'hq' | 'store'
    ingredientType: 'food' | 'packaging'
    quantityUnitKey?: string
  }[]
}

/** 원가 분석 목록 로드 실패 — 빈 배열과 구분 */
export class PosMenuCostAnalysisLoadError extends Error {
  readonly code: 'http' | 'parse' | 'server' | 'empty_body'
  readonly status?: number
  readonly serverCount?: number

  constructor(
    message: string,
    opts: {
      code: PosMenuCostAnalysisLoadError['code']
      status?: number
      serverCount?: number
    }
  ) {
    super(message)
    this.name = 'PosMenuCostAnalysisLoadError'
    this.code = opts.code
    this.status = opts.status
    this.serverCount = opts.serverCount
  }
}

export async function getPosMenuCostAnalysis(params?: { summary?: boolean }): Promise<PosMenuCostAnalysisRow[]> {
  const q = params?.summary ? '?summary=1' : ''
  const res = await apiFetch(`/api/getPosMenuCostAnalysis${q}`)
  const text = await res.text().catch(() => '')
  const headerRows = res.headers.get('X-CM-Pos-Cost-Analysis-Rows')
  const headerErr = res.headers.get('X-CM-Pos-Cost-Analysis-Error')
  const serverCount = headerRows != null && headerRows !== '' ? Number(headerRows) : NaN
  let parseFailed = false
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    parseFailed = true
    raw = null
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      parseFailed = true
      raw = null
    }
  }
  if (!res.ok) {
    let msg = `원가 분석 조회 실패 (HTTP ${res.status})`
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const o = raw as { message?: string; msg?: string; error?: string }
      msg = String(o.message || o.msg || o.error || msg)
    }
    throw new PosMenuCostAnalysisLoadError(msg, { code: 'http', status: res.status, serverCount })
  }
  if (headerErr === '1') {
    throw new PosMenuCostAnalysisLoadError(
      '서버에서 원가 분석 계산 중 오류가 발생했습니다. 잠시 후 다시 검색해 주세요.',
      { code: 'server', serverCount: 0 }
    )
  }
  let data: unknown = raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.rows)) data = o.rows
    else if (Array.isArray(o.data)) data = o.data
    else if (Array.isArray(o.items)) data = o.items
  }
  const arr = Array.isArray(data) ? (data as PosMenuCostAnalysisRow[]) : []
  if (parseFailed || !Array.isArray(data)) {
    const expected =
      !Number.isNaN(serverCount) && serverCount > 0
        ? ` (서버 ${serverCount}건 표시)`
        : ''
    throw new PosMenuCostAnalysisLoadError(
      `원가 분석 응답을 읽지 못했습니다${expected}. 네트워크가 불안정하거나 응답이 잘렸을 수 있습니다. Wi‑Fi에서 다시 검색해 주세요.`,
      { code: 'parse', serverCount }
    )
  }
  if (!Number.isNaN(serverCount) && serverCount > 0 && arr.length === 0) {
    throw new PosMenuCostAnalysisLoadError(
      `서버는 ${serverCount}건을 보냈다고 표시했지만 목록이 비었습니다. 응답이 잘렸을 수 있습니다. 다시 검색해 주세요.`,
      { code: 'parse', serverCount }
    )
  }
  if (!text.trim() && (Number.isNaN(serverCount) || serverCount > 0)) {
    throw new PosMenuCostAnalysisLoadError(
      '원가 분석 응답 본문이 비어 있습니다. 다시 검색해 주세요.',
      { code: 'empty_body', serverCount }
    )
  }
  if (process.env.NODE_ENV === 'development') {
    if (!Number.isNaN(serverCount) && arr.length !== serverCount) {
      console.error(
        '[getPosMenuCostAnalysis] 서버 헤더 X-CM-Pos-Cost-Analysis-Rows=' +
          serverCount +
          ' 인데, 파싱된 배열 길이=' +
          arr.length +
          '. 본문 잘림·JSON 오류 가능. response 본문 앞 200자:',
        text.slice(0, 200)
      )
    }
  }
  return arr
}

export interface PosCostAnalysisAuditRow {
  id: number
  actionType: string
  changedAt: string
  actorName: string | null
  actorRole: string | null
  actorStore: string | null
  actorEmployeeCode: string | null
  menuId: number | null
  menuCode: string | null
  menuName: string | null
  optionId: number | null
  optionName: string | null
  optionCode: string | null
  ingredientId: number | null
  itemCode: string | null
  itemName: string | null
  quantity: number
  lossRate: number
  ingredientType: string | null
  beforeQuantity?: number | null
  afterQuantity?: number | null
  beforeLossRate?: number | null
  afterLossRate?: number | null
  beforeItemCode?: string | null
  afterItemCode?: string | null
}

export type PosCostSalesWeightedChannelFilter = 'all' | 'dine_in' | 'takeout' | 'delivery' | 'other'

export type PosCostSalesWeightedResult = {
  startStr: string
  endStr: string
  storeFilter: string
  channel: PosCostSalesWeightedChannelFilter
  posTruncated: boolean
  warnings: string[]
  summary: {
    netSales: number
    /** POS 주문 전체 순매출(미매칭 포함) */
    posNetSales?: number
    excludedUnmatchedSales?: number
    salesCoveragePct?: number
    grossSalesBeforeDiscount: number
    totalCost: number
    foodCost: number
    packagingCost: number
    costPctOfNet: number
    /** 옵션→기본 BOM 폴백 제외 원가율 */
    costPctOfNetExactBom?: number
    costPctOfGross: number
    matchedLineQty: number
    unmatchedLineQty: number
    periodOrderCount: number
    miseRatePercent: number
  } | null
  byChannel: {
    channel: string
    orderCount: number
    netSales: number
    bundleDiscount: number
    paymentDiscount: number
    totalDiscount: number
    foodCost: number
    packagingCost: number
    totalCost: number
    contributionMargin: number
    costPctOfNet: number
  }[]
  byCategory: {
    categoryMain: string
    netSales: number
    totalCost: number
    foodCost: number
    packagingCost: number
    costPctOfNet: number
    matchedQty: number
    unmatchedQty: number
    topMenus?: {
      menuId: string
      optionId: string
      menuLabel: string
      optionLabel: string
      netSales: number
      totalCost: number
      foodCost: number
      packagingCost: number
      costPctOfNet: number
      matchedQty: number
      baseFallbackQty: number
    }[]
  }[]
  categoryMeta?: {
    excludedUnmatchedSales: number
    excludedUnmatchedQty: number
    paymentDiscountAllocated: number
    serviceAmtAllocated: number
    optionBaseFallbackQty?: number
    optionBaseFallbackSales?: number
    optionBaseFallbackCost?: number
  }
  bomUnmatchedLines: {
    menuId: string
    optionId: string
    menuLabel: string
    optionLabel: string
    reason: 'missing_menu_id' | 'missing_bom'
    lineQty: number
  }[]
}

export async function getPosCostSalesWeighted(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  channel?: PosCostSalesWeightedChannelFilter
  misePercent?: number
}): Promise<PosCostSalesWeightedResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.channel) q.set('channel', params.channel)
  if (params.misePercent != null && Number.isFinite(params.misePercent)) {
    q.set('misePercent', String(params.misePercent))
  }
  const res = await apiFetchWithOffline(`/api/getPosCostSalesWeighted?${q}`)
  const data = (await res.json()) as PosCostSalesWeightedResult & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function getPosCostAnalysisAudit(params?: {
  limit?: number
  startDate?: string
  endDate?: string
}): Promise<PosCostAnalysisAuditRow[]> {
  const qs = new URLSearchParams()
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  const q = qs.toString() ? `?${qs.toString()}` : ''
  const res = await apiFetch(`/api/getPosCostAnalysisAudit${q}`)
  const data = await res.json().catch(() => [])
  if (!res.ok) return []
  return Array.isArray(data) ? (data as PosCostAnalysisAuditRow[]) : []
}
