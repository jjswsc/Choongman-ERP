/**
 * 주문 장바구니 기준 본사 정산 미수금(직접정산·지두방 품목 제외) 합계
 *
 * 합계·부가세 반올림은 출고 인보이스와 동일 — `@/lib/invoice-vat-total`
 */
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'

export type OrderCartLine = { code?: string; name?: string; spec?: string; qty?: number; price?: number }

/** 직접정산 맵이 이미 있을 때 (일괄 처리에서 배치 조회 후 사용) */
export function computeOrderHqReceivableTotalWithMap(
  cart: OrderCartLine[],
  directMap: Record<string, boolean>
): { subtotalHQ: number; totalHQ: number } {
  let rawSubtotal = 0
  for (const it of cart) {
    const c = String(it.code || '').trim()
    if (c && directMap[c]) continue
    rawSubtotal += Number(it.price || 0) * Number(it.qty || 0)
  }
  if (rawSubtotal <= 0) {
    return { subtotalHQ: 0, totalHQ: 0 }
  }
  const { subtotalRounded, grandTotal } = thaiInvoiceTotalsFromRawSubtotal(rawSubtotal)
  return { subtotalHQ: subtotalRounded, totalHQ: grandTotal }
}

export async function computeOrderHqReceivableTotal(cart: OrderCartLine[]): Promise<{
  subtotalHQ: number
  totalHQ: number
}> {
  const codes = cart.map((it) => String(it.code || '').trim()).filter(Boolean)
  const directMap = codes.length > 0 ? await getDirectSettlementMap(codes) : {}
  return computeOrderHqReceivableTotalWithMap(cart, directMap)
}
