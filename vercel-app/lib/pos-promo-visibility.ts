import { bangkokDateStrISO } from '@/lib/bangkok-date'

export type OrderTypeForPromo = 'dine-in' | 'dine_in' | 'takeout' | 'delivery'

export interface PosPromoLike {
  isActive?: boolean
  validFrom?: string | null
  validTo?: string | null
  channelHall?: boolean
  channelTakeout?: boolean
  channelDelivery?: boolean
  deliveryAppCodes?: string[] | null
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
