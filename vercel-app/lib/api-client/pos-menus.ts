/**
 * POS 메뉴 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import type { PosMenuUpsertApiBody } from '../pos-menu-upsert-server'
import { jsonAsArray } from '../safe-api-json'
import { parsePosMutationResponse } from './helpers'

export interface PosMenu {
  id: string
  code: string
  name: string
  category: string
  categoryMain?: string
  price: number
  priceDelivery?: number | null
  imageUrl: string
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  soldOutDate?: string | null
  /** 옵션 단계별 선택 그룹. 예: ["size","bone"] → 1단계 사이즈, 2단계 뼈/순살 */
  optionSelectionGroups?: string[]
  /** 그룹별 선택 규칙(1단계): required/optional + 최대 1개 선택 */
  optionSelectionConfig?: PosOptionSelectionGroupConfig[]
  /** 주방: null=설정·카테고리 따름, 0=주방 미인쇄, 1~3=해당 주방 */
  kitchenPrinter?: number | null
  /** 조리 시간(분), 예상 완성 시간/KDS 등 활용 */
  cookingTimeMin?: number | null
  /** 반반 메뉴: POS에서 다른 치킨(S 순살) 2개를 골라 한 상으로 주문, 원가는 각 0.5씩 */
  isBanban?: boolean
  /** 반반 메뉴별 허용 맛 메뉴 id 목록 (명시적 whitelist) */
  banbanFlavorMenuIds?: string[]
  /** 프로모션 마스터와 연동된 미러 메뉴 */
  promoId?: string | null
  /** 채널별 메뉴 설명 (미입력 시 default 사용) */
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
  /** 메뉴 노출 대상 매장 목록(비어 있으면 호환모드에서 전체 노출 가능) */
  storeCodes?: string[]
  /** 홀(매장 주문) 메뉴 노출 여부 */
  sellHall?: boolean
  /** 배달 주문 메뉴 노출 여부 */
  sellDelivery?: boolean
  /** 포장 주문 메뉴 노출 여부 */
  sellPackaging?: boolean
}

export interface PosOptionSelectionGroupConfig {
  key: string
  label?: string
  /** 단계 노출 채널: all(홀+배달+포장) | hall(홀+포장) | delivery(배달 전용) */
  audience?: 'all' | 'hall' | 'delivery'
  required?: boolean
  minSelect?: number
  maxSelect?: number
}

export interface PosMenuOption {
  id: string
  menuId: string
  /** 메뉴별 고유 옵션 코드 (예: C001-1) */
  optionCode?: string
  name: string
  priceModifier: number
  priceModifierDelivery?: number | null
  priceModifierPackaging?: number | null
  sortOrder: number
  optionType?: 'substitution' | 'additive'
  itemCode?: string | null
  /** 추가형: 연결 소스 메뉴 DB id. 있으면 item_code(레거시)보다 우선 */
  additiveSourceMenuId?: number | null
  quantity?: number
  /** 복합 옵션의 단계별 값. 예: {"size":"M","part":"순살"} */
  optionStepValues?: Record<string, string> | null
  /** 홀에서 판매 */
  sellHall?: boolean
  /** 배달에서 판매 */
  sellDelivery?: boolean
  /** 포장에서 판매 */
  sellPackaging?: boolean
  /** 채널별 옵션 설명 (미입력 시 default 사용) */
  descriptionDefault?: string
  descriptionDelivery?: string | null
  descriptionTable?: string | null
}

export interface PosOptionGroupItem {
  id: string
  groupId: string
  /** 그룹 항목 코드(선택) */
  itemCode?: string
  itemName: string
  sortOrder: number
  basePriceHall: number
  basePriceDelivery?: number | null
  sellHall: boolean
  sellDelivery: boolean
}

export interface PosMenuOptionGroupLink {
  id?: string
  menuId: string
  groupId: string
  sortOrder: number
  sellHall: boolean
  sellDelivery: boolean
  priceHallOverride?: number | null
  priceDeliveryOverride?: number | null
  required?: boolean
  minSelect?: number
  maxSelect?: number
}

export interface PosOptionGroup {
  id: string
  /** 그룹 내부 고유 코드(1차 호환: key 기반 파생) */
  code?: string
  key: string
  name: string
  isActive: boolean
  sortOrder: number
  items: PosOptionGroupItem[]
  link?: PosMenuOptionGroupLink | null
  /** menuId 없이 전체 조회 시: 이 그룹을 링크한 서로 다른 메뉴 수 */
  linkedMenuCount?: number
}

export type PosPackagingChecklistOrderType = 'takeout' | 'delivery' | 'both'

export interface PosMenuPackagingCheckItem {
  id: string
  menuId: string
  optionId?: string | null
  orderType: PosPackagingChecklistOrderType
  itemName: string
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

export interface PosOrderPackagingChecklistGroup {
  orderItemId: string
  itemName: string
  menuId: string
  menuName?: string
  optionId?: string | null
  optionName?: string | null
  checks: {
    id: string
    itemName: string
    isRequired: boolean
    sortOrder: number
    optionId?: string | null
  }[]
}

export async function getPosMenus(params?: { fresh?: boolean; storeCode?: string | null }) {
  const storeCode = String(params?.storeCode || '').trim()
  const q = new URLSearchParams()
  if (storeCode) q.set('storeCode', storeCode)
  const url = '/api/getPosMenus' + (q.toString() ? `?${q.toString()}` : '')
  const cacheKey = posMenusCatalogCacheKey(storeCode || null)
  if (params?.fresh) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as PosMenu[]) : []
  }
  return fetchPosCatalogCached<PosMenu[]>(cacheKey, url, [])
}

export async function getPosMenuPackagingChecklist(params: { menuId: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  const res = await apiFetchWithOffline(`/api/getPosMenuPackagingChecklist?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    schemaReady?: boolean
    message?: string
    items: PosMenuPackagingCheckItem[]
  }>
}

export async function savePosMenuPackagingChecklist(params: {
  menuId: string
  items: {
    id?: string
    optionId?: string | null
    orderType: PosPackagingChecklistOrderType
    itemName: string
    isRequired: boolean
    sortOrder: number
    isActive: boolean
  }[]
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuPackagingChecklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; saved?: number }>
}

export async function getPosPackagingChecklistByOrder(params: { orderId: number }) {
  const q = new URLSearchParams()
  q.set('orderId', String(params.orderId))
  const res = await apiFetchWithOffline(`/api/getPosPackagingChecklistByOrder?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    schemaReady?: boolean
    message?: string
    orderType?: 'takeout' | 'delivery' | null
    hasChecklist: boolean
    groups: PosOrderPackagingChecklistGroup[]
    unresolvedMappings: { orderItemId: string; itemName: string }[]
  }>
}

export async function getNextPosMenuCode(mainCategory: string) {
  const q = new URLSearchParams({ mainCategory })
  const res = await apiFetchWithOffline(`/api/getNextPosMenuCode?${q}`)
  return res.json() as Promise<{ code: string | null; message?: string }>
}

export async function getPosMenuCategories() {
  return fetchPosCatalogCached<{ categories: string[]; mainCategories: string[] }>(
    'erp:posCatalog:categories',
    '/api/getPosMenuCategories',
    { categories: [], mainCategories: [] }
  )
}

export interface PosMenuCategoriesConfig {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
}

export type DeliveryAppCode = 'grab' | 'lineman' | 'shopee'
export type DeliveryAcceptanceMode = 'manual' | 'auto'

export interface PosDeliveryAppPolicy {
  storeCode: string
  appCode: DeliveryAppCode
  enabled: boolean
  orderAcceptanceMode: DeliveryAcceptanceMode
  autoAcceptEnabled: boolean
  /** 플랫폼 정산 수수료(%) — Grab/LINE 등 익일 NET 입금 대사 (본사 PO 배달 GP와 별도) */
  settlementFeePct?: number | null
  updatedAt?: string
}

export interface PosDeliveryMenuPolicy {
  storeCode: string
  appCode: DeliveryAppCode
  menuId: number
  enabled: boolean
  sortOrder: number
  sellStartTime?: string | null
  sellEndTime?: string | null
  stockQty?: number | null
  soldOut: boolean
  autoStopOnZero: boolean
  imageUrl?: string | null
}

export interface PosDeliveryCategoryOrder {
  storeCode: string
  appCode: DeliveryAppCode
  categoryMain?: string
  category: string
  sortOrder: number
}

export interface PosDeliveryPolicyBundle {
  success?: boolean
  appPolicy: PosDeliveryAppPolicy
  menuPolicies: PosDeliveryMenuPolicy[]
  categoryOrders: PosDeliveryCategoryOrder[]
}

export async function getPosMenuCategoriesConfig() {
  const res = await apiFetchWithOffline('/api/posMenuCategories')
  return res.json() as Promise<PosMenuCategoriesConfig>
}

export async function applyPosMenuCategoryPresets() {
  const res = await apiFetchWithOffline('/api/applyPosMenuCategoryPresets', {
    method: 'POST',
  })
  return res.json() as Promise<{ success: boolean; updated: number; total: number }>
}

export async function savePosMenuCategoriesConfig(params: {
  mainCategories: string[]
  categoriesByMain: Record<string, string[]>
  applyToMenus?: boolean
}) {
  const res = await apiFetchWithOffline('/api/posMenuCategories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    mainCategories: string[]
    categoriesByMain: Record<string, string[]>
    menusUpdated?: number
    message?: string
  }>
}

export async function getPosDeliveryAppPolicies(params: {
  storeCode: string
  appCode: DeliveryAppCode
}) {
  const q = new URLSearchParams()
  q.set('storeCode', params.storeCode)
  q.set('appCode', params.appCode)
  const res = await apiFetchWithOffline(`/api/getPosDeliveryAppPolicies?${q.toString()}`)
  return res.json() as Promise<PosDeliveryPolicyBundle & { success: boolean; message?: string }>
}

export async function savePosDeliveryAppPolicies(params: {
  storeCode: string
  appCode: DeliveryAppCode
  appPolicy?: Partial<PosDeliveryAppPolicy>
  menuPolicies?: PosDeliveryMenuPolicy[]
  categoryOrders?: PosDeliveryCategoryOrder[]
}) {
  const res = await apiFetchWithOffline('/api/savePosDeliveryAppPolicies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type GrabPromoCampaign = {
  merchantID: string
  id: string
  name: string
  section: 'ongoing' | 'upcoming'
  discountType: string
  discountValue: number
  itemIds: string[]
  startTimeUtc: string
  endTimeUtc: string
  startTimeBkk: string
  endTimeBkk: string
}

export type GrabErpPromoForCampaignLookup = {
  promoId: number
  name: string
  campaignNameRef: string
  grabMenuItemId: string
  salePrice: number
  regularPrice: number
  validFrom: string | null
  validTo: string | null
}

export async function getGrabPromoCampaigns(params: { storeCode?: string; merchantID?: string }) {
  const q = new URLSearchParams()
  if (params.storeCode) q.set('storeCode', params.storeCode)
  if (params.merchantID) q.set('merchantID', params.merchantID)
  const res = await apiFetchWithOffline(`/api/grab/debugPromoCampaigns?${q.toString()}`)
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeCode?: string
    resolvedFrom?: 'storeCode' | 'merchantID' | 'default'
    resolvedMerchantIDs?: string[]
    todayBkk?: string
    campaignsSuppressed?: boolean
    consumerListPriceMode?: 'sale' | 'regular'
    grabCampaignCount?: number
    grabCampaigns?: GrabPromoCampaign[]
    erpGrabPromos?: GrabErpPromoForCampaignLookup[]
    hint?: string
  }>
}

export async function getPosMenuOptions(params?: {
  menuId?: string
  fresh?: boolean
  forCodeMap?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.menuId) q.set('menuId', params.menuId)
  if (params?.forCodeMap) q.set('forCodeMap', '1')
  const qs = q.toString()
  const url = '/api/getPosMenuOptions' + (qs ? `?${qs}` : '')
  if (params?.fresh) {
    const res = await apiFetchWithOffline(url)
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? (data as PosMenuOption[]) : []
  }
  const cacheKey = `erp:posCatalog:options:${params?.menuId?.trim() || 'all'}:${params?.forCodeMap ? 'codemap' : 'default'}`
  return fetchPosCatalogCached<PosMenuOption[]>(cacheKey, url, [])
}

export async function getPosOptionGroups(params?: { menuId?: string }) {
  const q = new URLSearchParams()
  if (params?.menuId) q.set("menuId", params.menuId)
  const qs = q.toString()
  const res = await apiFetchWithOffline(
    "/api/getPosOptionGroups" + (qs ? `?${qs}` : "")
  )
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? (data as PosOptionGroup[]) : []
}

export async function savePosOptionGroup(params: {
  id?: string
  key: string
  name: string
  isActive?: boolean
  sortOrder?: number
  items: Array<{
    id?: string
    itemName: string
    sortOrder: number
    basePriceHall?: number
    basePriceDelivery?: number | null
    sellHall?: boolean
    sellDelivery?: boolean
  }>
}) {
  const res = await apiFetchWithOffline("/api/savePosOptionGroup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: string; message?: string }>
}

export async function deletePosOptionGroup(params: { id: string }) {
  const res = await apiFetchWithOffline("/api/deletePosOptionGroup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosMenuOptionGroupLinks(params: {
  menuId: number
  links: Array<{
    id?: string
    groupId: string
    sortOrder: number
    sellHall?: boolean
    sellDelivery?: boolean
    priceHallOverride?: number | null
    priceDeliveryOverride?: number | null
    required?: boolean
    minSelect?: number
    maxSelect?: number
  }>
}) {
  const res = await apiFetchWithOffline("/api/savePosMenuOptionGroupLinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function migratePosMenuOptionsToGroupLinks(params?: {
  menuId?: number
  dryRun?: boolean
}) {
  const res = await apiFetchWithOffline("/api/migratePosMenuOptionsToGroupLinks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  })
  return res.json() as Promise<{
    success: boolean
    dryRun?: boolean
    menuCount?: number
    groupsCreated?: number
    itemsCreated?: number
    linksSaved?: number
    message?: string
  }>
}

export async function savePosMenuOption(
  params: {
    id?: string
    menuId: number
    optionCode?: string
    name: string
    priceModifier?: number
    priceModifierDelivery?: number | null
    priceModifierPackaging?: number | null
    sortOrder?: number
    optionType?: 'substitution' | 'additive'
    itemCode?: string | null
    additiveSourceMenuId?: number | null
    quantity?: number
    optionStepValues?: Record<string, string> | null
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    descriptionDefault?: string
    descriptionDelivery?: string | null
    descriptionTable?: string | null
  },
  opts?: { requireOnline?: boolean }
) : Promise<{ success: boolean; message?: string; optionCode?: string; remappedOptionCode?: boolean }> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenuOption', init)
    : await apiFetchWithOffline('/api/savePosMenuOption', init)
  if (opts?.requireOnline) {
    const parsed = await parsePosMutationResponse(res)
    return { ...parsed, optionCode: undefined, remappedOptionCode: false }
  }
  return res.json() as Promise<{ success: boolean; message?: string; optionCode?: string; remappedOptionCode?: boolean }>
}

export async function savePosMenuOptionsBulk(
  params: {
    options: Array<{
      id?: string
      menuId: number
      optionCode?: string
      name: string
      priceModifier?: number
      priceModifierDelivery?: number | null
      priceModifierPackaging?: number | null
      sortOrder?: number
      optionType?: "substitution" | "additive"
      itemCode?: string | null
      additiveSourceMenuId?: number | null
      quantity?: number
      optionStepValues?: Record<string, string> | null
      sellHall?: boolean
      sellDelivery?: boolean
      sellPackaging?: boolean
    }>
    storeCode?: string
  },
  opts?: { requireOnline?: boolean }
) : Promise<{
  success: boolean
  message?: string
  remappedCount?: number
  results?: { id?: string; success: boolean; message?: string; optionCode?: string; remapped?: boolean }[]
}> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch("/api/savePosMenuOptionsBulk", init)
    : await apiFetchWithOffline("/api/savePosMenuOptionsBulk", init)
  if (opts?.requireOnline) {
    const parsed = await parsePosMutationResponse(res)
    return { ...parsed, remappedCount: 0, results: [] }
  }
  return res.json() as Promise<{
    success: boolean
    message?: string
    remappedCount?: number
    results?: { id?: string; success: boolean; message?: string; optionCode?: string; remapped?: boolean }[]
  }>
}

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
  quantity: number
  lossRate: number
  costPerUnit: number
  costTotal: number
}

export async function getMenuCost(params: { menuId: string; optionId?: string }) {
  const q = new URLSearchParams()
  q.set('menuId', params.menuId)
  if (params.optionId !== undefined) q.set('optionId', params.optionId)
  const res = await apiFetch('/api/getMenuCost?' + q.toString())
  const raw: unknown = await res.json()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { cost: 0, breakdown: [] }
  }
  const o = raw as Record<string, unknown>
  return {
    cost: Number(o.cost) || 0,
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

export async function getPosMenuCostAnalysis(params?: { summary?: boolean }): Promise<PosMenuCostAnalysisRow[]> {
  const q = params?.summary ? '?summary=1' : ''
  const res = await apiFetch(`/api/getPosMenuCostAnalysis${q}`)
  const text = await res.text().catch(() => '')
  const headerRows = res.headers.get('X-CM-Pos-Cost-Analysis-Rows')
  const headerErr = res.headers.get('X-CM-Pos-Cost-Analysis-Error')
  const serverCount = headerRows != null && headerRows !== '' ? Number(headerRows) : NaN
  let raw: unknown = null
  try {
    raw = text ? JSON.parse(text) : null
  } catch {
    raw = null
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) return []
  let data: unknown = raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.rows)) data = o.rows
    else if (Array.isArray(o.data)) data = o.data
    else if (Array.isArray(o.items)) data = o.items
  }
  const arr = Array.isArray(data) ? (data as PosMenuCostAnalysisRow[]) : []
  if (process.env.NODE_ENV === 'development') {
    if (!Array.isArray(data)) {
      console.warn(
        '[getPosMenuCostAnalysis] 응답이 배열이 아닙니다. Network → Response 본문 확인.',
        typeof raw,
        raw && typeof raw === 'object' ? Object.keys(raw as object).slice(0, 8) : raw
      )
    }
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
    if (headerErr === '1' && arr.length === 0) {
      console.error(
        '[getPosMenuCostAnalysis] 서버에서 예외 처리됨(X-CM-Pos-Cost-Analysis-Error=1). API 라우트 터미널 로그(getPosMenuCostAnalysis:) 확인.'
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
