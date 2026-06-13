/**
 * POS 프로모션 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { jsonAsArray } from '../safe-api-json'
import { apiJsonArrayResponse } from './helpers'

export interface PosPromo {
  id: string
  code: string
  /** 캠페인 허브 고유번호(campaign_no) — API가 marketing_campaign_id로 조회해 붙임 */
  marketingCampaignNo?: string | null
  name: string
  category: string
  categoryMain?: string
  price: number
  marketingCampaignId?: string | null
  priceDelivery?: number | null
  vatIncluded: boolean
  isActive: boolean
  sortOrder: number
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
  discountPercent?: number | null
  validFrom?: string | null
  validTo?: string | null
  /** Grab 캠페인 시작 시각(방콕 HH:mm) */
  grabCampaignStartTimeBkk?: string | null
  /** Grab 캠페인 종료 시각(방콕 HH:mm) */
  grabCampaignEndTimeBkk?: string | null
  marketingActualCost?: number
  expenseAccrualId?: string | null
  /** 세트 구성 Step 1 가격 기준 (DB 컬럼 compose_pricing_basis, 없으면 hall) */
  composePricingBasis?: 'hall' | 'delivery'
}

export interface PosPromoItem {
  id: string
  promoId: string
  menuId: string
  optionId: string | null
  optionCode?: string | null
  quantity: number
  sortOrder: number
  /** 같은 값끼리 한 선택 그룹(예: drink) */
  choiceGroup?: string | null
  /** 그룹에서 선택해야 하는 개수(예: 1 = 3개 중 1개) */
  choicePickCount?: number | null
}

export async function getPosPromos(params?: { campaignId?: string; standaloneOnly?: boolean }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set('campaignId', params.campaignId)
  if (params?.standaloneOnly) q.set('standaloneOnly', 'true')
  const res = await apiFetchWithOffline('/api/getPosPromos' + (q.toString() ? '?' + q.toString() : ''))
  return apiJsonArrayResponse<PosPromo>(res)
}

export async function getPosPromoSchemaStatus() {
  const res = await apiFetchWithOffline('/api/posPromoSchemaStatus')
  return res.json() as Promise<{
    posPromosExtended: boolean
    posMenusPromoId: boolean
    ok: boolean
  }>
}

export async function getNextPosPromoCode(params: { campaignId: string }) {
  const q = new URLSearchParams()
  q.set('campaignId', params.campaignId.trim())
  const res = await apiFetchWithOffline('/api/getNextPosPromoCode?' + q.toString())
  return res.json() as Promise<{ code: string | null; message?: string }>
}

export interface PosPromoWithItems extends PosPromo {
  items: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    quantity: number
    choiceGroup?: string | null
    choicePickCount?: number | null
    /** 서버에서 pos_menus 조인으로 채움 — 주방 슬립이 #ID 대신 이름을 찍도록 */
    menuName?: string
    menuCode?: string
  }[]
}

export async function getPosPromosWithItems(params?: { campaignId?: string; includeInactive?: boolean }) {
  const q = new URLSearchParams()
  if (params?.campaignId) q.set("campaignId", params.campaignId)
  if (params?.includeInactive) q.set("includeInactive", "true")
  const qs = q.toString()
  const url = '/api/getPosPromosWithItems' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posCatalog:promos:${params?.campaignId?.trim() || ''}:${params?.includeInactive ? '1' : '0'}`
  return fetchPosCatalogCached<PosPromoWithItems[]>(cacheKey, url, [])
}

export async function getPosPromoItems(params: { promoId: string }) {
  const q = new URLSearchParams()
  q.set('promoId', params.promoId)
  const res = await apiFetchWithOffline('/api/getPosPromoItems?' + q.toString())
  return jsonAsArray<PosPromoItem>(await res.json())
}

export async function savePosPromo(params: {
  id?: string
  /** 비우면 서버가 캠페인 고유번호 기준으로 자동 부여 ({번호}-S01 …) */
  code?: string
  name: string
  category?: string
  categoryMain?: string
  price?: number
  priceDelivery?: number | null
  vatIncluded?: boolean
  isActive?: boolean
  sortOrder?: number
  marketingCampaignId?: string | null
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
  discountPercent?: number | null
  validFrom?: string | null
  validTo?: string | null
  grabCampaignStartTimeBkk?: string | null
  grabCampaignEndTimeBkk?: string | null
  marketingActualCost?: number | null
  /** 메뉴 관리 세트: 캠페인 없이 저장 (서버가 SET-1 … 코드 부여) */
  standaloneSetMenu?: boolean
  vendorCode?: string
  userRole?: string
  userName?: string
  composePricingBasis?: 'hall' | 'delivery'
}) {
  const res = await apiFetchWithOffline('/api/savePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: string
    expenseSyncMessage?: string
  }>
}

export async function savePosPromoItem(params: {
  id?: string
  promoId: number
  menuId: number
  optionId?: number | null
  /** 저장 시점 option_code 스냅샷 — option_id 재매핑·복구용 */
  optionCode?: string | null
  quantity?: number
  sortOrder?: number
  choiceGroup?: string | null
  choicePickCount?: number | null
}) {
  const res = await apiFetchWithOffline('/api/savePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromoItem(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPromoItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosPromo(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosPromo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
