/**
 * POS 메뉴 배달앱·Grab 프로모 — pos-menus.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

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
