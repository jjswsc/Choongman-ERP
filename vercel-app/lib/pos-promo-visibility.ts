import { bangkokDateStrISO } from '@/lib/bangkok-date'
import { shouldMenuBeVisibleForStore } from '@/lib/pos-menu-store-scope'

export type OrderTypeForPromo = 'dine-in' | 'dine_in' | 'takeout' | 'delivery'

export interface PosPromoLike {
  id?: string
  isActive?: boolean
  validFrom?: string | null
  validTo?: string | null
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
  /** pos_menus.promo_id 미러가 있으면 true — 노란 카드 대신 메뉴 타일로만 노출 */
  hasMirrorMenu?: boolean
}

function normalizeOrderType(t: OrderTypeForPromo | string): 'dine_in' | 'takeout' | 'delivery' {
  const s = String(t).toLowerCase().replace(/-/g, '_')
  if (s === 'takeout') return 'takeout'
  if (s === 'delivery') return 'delivery'
  return 'dine_in'
}

/** yyyy-MM-dd 문자열이 [from,to] 안에 있는지 (끝값 포함). from/to null이면 제한 없음. */
export function isDateInPromoRange(
  businessDateYmd: string,
  validFrom: string | null | undefined,
  validTo: string | null | undefined
): boolean {
  const d = businessDateYmd.trim()
  if (!d) return true
  const from = validFrom?.trim() || null
  const to = validTo?.trim() || null
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

/** POS에서 프로모 노출 여부: 활성 + 기간 + 채널 + (배달 시) 앱 코드 */
export function isPromoVisibleInContext(
  p: PosPromoLike,
  ctx: {
    businessDateYmd?: string
    orderType: OrderTypeForPromo | string
    deliveryAppCode?: string | null
  }
): boolean {
  if (p.isActive === false) return false
  const day = ctx.businessDateYmd ?? bangkokDateStrISO()
  if (!isDateInPromoRange(day, p.validFrom ?? null, p.validTo ?? null)) return false

  const ot = normalizeOrderType(ctx.orderType)
  if (ot === 'dine_in' && p.channelHall === false) return false
  if (ot === 'takeout' && p.channelTakeout === false) return false
  if (ot === 'delivery' && p.channelDelivery === false) return false

  if (ot === 'delivery' && p.deliveryAppCodes && p.deliveryAppCodes.length > 0) {
    const app = String(ctx.deliveryAppCode ?? '')
      .trim()
      .toLowerCase()
    // 앱 미선택(주문 화면 등)이면 제한 목록 무시하고 노출
    if (!app) return true
    const allowed = p.deliveryAppCodes.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
    if (!allowed.some((c) => c === app)) return false
  }

  return true
}

/**
 * POS 노란 프로모 카드(미러 없는 폴백)를 그릴지.
 * 미러 메뉴가 있으면 매장 스코프된 메뉴 타일만 쓰고, 다른 매장에 노란 카드로 다시 뜨지 않게 한다.
 */
export function shouldShowStandalonePromoTile(params: {
  hasMirrorMenu?: boolean
  promoId?: string
  linkedPromoIds: ReadonlySet<string>
}): boolean {
  if (params.hasMirrorMenu) return false
  const id = String(params.promoId || '').trim()
  if (id && params.linkedPromoIds.has(id)) return false
  return true
}

/** 미러 메뉴 매장 스코프가 있으면 그 매장에서만 프로모 목록에 포함한다. */
export function shouldIncludeMirroredPromoForStore(params: {
  requestedStoreCode: string
  hasMirrorMenu: boolean
  mirrorStoreCodes: string[]
  compatibilityMode: boolean
  scopeSchemaReady: boolean
}): boolean {
  const requested = String(params.requestedStoreCode || '').trim()
  if (!requested) return true
  if (!params.hasMirrorMenu) return true
  return shouldMenuBeVisibleForStore({
    requestedStoreCode: requested,
    scopedStores: params.mirrorStoreCodes,
    compatibilityMode: params.compatibilityMode,
    scopeSchemaReady: params.scopeSchemaReady,
  })
}
