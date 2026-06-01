import { grabJsonRequest } from '@/lib/grab-openapi'
import { isGrabFoodMerchantMapKey } from '@/lib/grab-resolve-menu-notification-merchants'

export type GrabCreateSelfServeJourneyResponse = {
  activationUrl: string
}

export async function grabCreateSelfServeJourney(partnerMerchantID: string) {
  return grabJsonRequest<GrabCreateSelfServeJourneyResponse>({
    path: '/partner/v1/self-serve/activation',
    method: 'POST',
    body: { partner: { merchantID: partnerMerchantID } },
  })
}

export async function grabUpdateMenuNotification(merchantID: string): Promise<void> {
  const id = String(merchantID || '').trim()
  if (!id || !isGrabFoodMerchantMapKey(id)) {
    console.warn('[grab] updateMenuNotification: invalid merchantID (check GRAB_STORE_MAP_JSON)', {
      merchantID,
    })
    throw new Error('grab_menu_notification_merchant_unresolved')
  }
  await grabJsonRequest({
    path: '/partner/v1/merchant/menu/notification',
    method: 'POST',
    body: { merchantID: id },
  })
}

type GrabMenuField = 'ITEM' | 'MODIFIER'
type GrabAvailableStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNAVAILABLETODAY'

export type GrabUpdateAdvancedPricing = {
  key: string
  price: number
}

export type GrabUpdatePurchasability = {
  key: string
  purchasable: boolean
}

export type GrabUpdateMenuItemPayload = {
  merchantID: string
  field: 'ITEM'
  id: string
  price?: number
  availableStatus?: GrabAvailableStatus
  maxStock?: number
  advancedPricings?: GrabUpdateAdvancedPricing[]
  purchasabilities?: GrabUpdatePurchasability[]
}

export type GrabUpdateMenuModifierPayload = {
  merchantID: string
  field: 'MODIFIER'
  id: string
  name: string
  isFree?: boolean
  price?: number
  availableStatus?: GrabAvailableStatus
  advancedPricings?: GrabUpdateAdvancedPricing[]
}

export type GrabUpdateMenuPayload = GrabUpdateMenuItemPayload | GrabUpdateMenuModifierPayload

export async function grabUpdateMenuRecord(payload: GrabUpdateMenuPayload): Promise<void> {
  await grabJsonRequest({
    path: '/partner/v1/menu',
    method: 'PUT',
    body: payload,
  })
}

export type GrabListOrder = {
  orderID: string
  shortOrderNumber?: string
  merchantID?: string
  partnerMerchantID?: string
  orderState?: string
  [k: string]: unknown
}

export type GrabListOrdersResponse = {
  more: boolean
  orders: GrabListOrder[]
}

export async function grabListOrdersByDate(params: {
  merchantID: string
  date: string
  page: number
}) {
  return grabJsonRequest<GrabListOrdersResponse>({
    path: '/partner/v1/orders',
    method: 'GET',
    query: {
      merchantID: params.merchantID,
      date: params.date,
      page: params.page,
    },
  })
}

export async function grabListOrdersByIds(params: {
  merchantID: string
  orderIDs: string[]
}) {
  return grabJsonRequest<GrabListOrdersResponse>({
    path: '/partner/v1/orders',
    method: 'GET',
    query: {
      merchantID: params.merchantID,
      orderIDs: params.orderIDs,
    },
  })
}

export type GrabEditOrderModifier = {
  id: string
  quantity: number
}

export type GrabEditOrderItem = {
  id?: string
  externalItemID?: string
  quantity: number
  status?: string
  modifiers?: GrabEditOrderModifier[]
  [k: string]: unknown
}

export type GrabEditOrderPayload = {
  orderID: string
  items: GrabEditOrderItem[]
  onlyRecalculate?: boolean
  depositAmountInMin?: number
  offlinePOSDiscountInMin?: number
  [k: string]: unknown
}

export type GrabEditOrderResponse = {
  orderID: string
  shortOrderNumber?: string
  [k: string]: unknown
}

export async function grabEditOrderV2(payload: GrabEditOrderPayload) {
  const safeOrderID = encodeURIComponent(payload.orderID)
  return grabJsonRequest<GrabEditOrderResponse>({
    path: `/partner/v2/orders/${safeOrderID}`,
    method: 'PUT',
    body: payload,
  })
}

export type GrabCancelOrderPayload = {
  orderID: string
  merchantID: string
  cancelCode: 1001 | 1002 | 1003 | 1004
}

export type GrabCancelOrderResponse = {
  limitType?: string
  limitTimes?: number
}

export async function grabCancelOrder(payload: GrabCancelOrderPayload) {
  return grabJsonRequest<GrabCancelOrderResponse>({
    path: '/partner/v1/order/cancel',
    method: 'PUT',
    body: payload,
  })
}

export type GrabMarkOrderReadyPayload = {
  orderID: string
  markStatus: 1 | 2
}

export async function grabMarkOrderReady(payload: GrabMarkOrderReadyPayload): Promise<void> {
  await grabJsonRequest({
    path: '/partner/v1/orders/mark',
    method: 'POST',
    body: payload,
  })
}

export type GrabStoreStatusResponse = {
  closeReason?: string
  isInSpecialOpeningHourRange?: boolean
  isOpen?: boolean
}

export async function grabGetStoreStatus(merchantID: string) {
  const safeMerchantID = encodeURIComponent(merchantID)
  return grabJsonRequest<GrabStoreStatusResponse>({
    path: `/partner/v1/merchants/${safeMerchantID}/store/status`,
    method: 'GET',
  })
}

export type GrabPauseStorePayload = {
  merchantID: string
  isPause: boolean
  duration?: '30m' | '1h' | '24h'
}

export async function grabPauseStore(payload: GrabPauseStorePayload): Promise<void> {
  await grabJsonRequest({
    path: '/partner/v1/merchant/pause',
    method: 'PUT',
    body: payload,
  })
}

export function isGrabMenuField(value: string): value is GrabMenuField {
  return value === 'ITEM' || value === 'MODIFIER'
}

