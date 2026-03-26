/**
 * 주문 장바구니 기준 본사 정산 미수금(직접정산·지두방 품목 제외) 합계
 */
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'

export type OrderCartLine = { code?: string; name?: string; spec?: string; qty?: number; price?: number }

/** 직접정산 맵이 이미 있을 때 (일괄 처리에서 배치 조회 후 사용) */
export function computeOrderHqReceivableTotalWithMap(
  cart: OrderCartLine[],
  directMap: Record<string, boolean>
): { subtotalHQ: number; totalHQ: number } {
  let subtotalHQ = 0
  for (const it of cart) {
    const c = String(it.code || '').trim()
    if (c && directMap[c]) continue
    subtotalHQ += Number(it.price || 0) * Number(it.qty || 0)
  }
  const totalHQ = subtotalHQ > 0 ? subtotalHQ + Math.round(subtotalHQ * 0.07) : 0
  return { subtotalHQ, totalHQ }
}

export async function computeOrderHqReceivableTotal(cart: OrderCartLine[]): Promise<{
  subtotalHQ: number
  totalHQ: number
}> {
  const codes = cart.map((it) => String(it.code || '').trim()).filter(Boolean)
  const directMap = codes.length > 0 ? await getDirectSettlementMap(codes) : {}
  return computeOrderHqReceivableTotalWithMap(cart, directMap)
}
