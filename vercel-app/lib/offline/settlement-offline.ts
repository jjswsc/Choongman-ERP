/**
 * 영업 결산 API - 오프라인 시 캐시 사용
 * POS 영업관리: 매출 관리와 동일 동작 (인터넷 유무 관계없이 같은 화면)
 */

import { isOnline } from './network'
import { getFromCache, setCache } from './cache'
import { getPosSettlement, type PosCloseRun, type PosSettlement } from '@/lib/api-client'

/** 영업 시작 저장 직후 POS 터미널 게이트가 캐시·상태를 다시 읽도록 알림 */
export const POS_BUSINESS_OPEN_UPDATED_EVENT = 'cm-pos-business-open-updated'

function cacheKeySettlement(storeCode: string, settleDate: string): string {
  return `settlement:${storeCode}:${settleDate}`
}

const EMPTY_SETTLEMENT_RESPONSE = (): PosSettlementResponse => ({
  systemTotal: 0,
  systemSubtotal: 0,
  systemVat: 0,
  systemCashFromOrders: 0,
  tillNetForSettleDate: 0,
  linkpos: null,
  settlement: null,
  closeRun: null,
})

export function dispatchPosBusinessOpenUpdated(detail: {
  storeCode: string
  settleDate: string
}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(POS_BUSINESS_OPEN_UPDATED_EVENT, { detail }))
}

/** 영업 시작 저장 직후 오프라인 캐시에 cash_actual 반영 — 터미널 게이트가 즉시 통과 */
export async function applyPosSettlementSaveToCache(params: {
  storeCode: string
  settleDate: string
  cashActual: number
}): Promise<void> {
  try {
    const storeCode = String(params.storeCode || '').trim()
    const settleDate = String(params.settleDate || '').trim().slice(0, 10)
    if (!storeCode || !settleDate) return

    const key = cacheKeySettlement(storeCode, settleDate)
    const cached = (await getFromCache<PosSettlementResponse>('pos_sales_cache', key)) ?? EMPTY_SETTLEMENT_RESPONSE()
    const prev = cached.settlement
    const single = Array.isArray(prev) ? prev[0] : prev
    const nextSettlement: PosSettlement = single
      ? { ...single, storeCode, settleDate, cashActual: params.cashActual }
      : {
          storeCode,
          settleDate,
          cashActual: params.cashActual,
          cardAmt: 0,
          qrAmt: 0,
          deliveryAppAmt: 0,
          otherAmt: 0,
          memo: '',
          closed: false,
        }
    await setCache('pos_sales_cache', key, { ...cached, settlement: nextSettlement })
  } catch {
    /* IndexedDB 불능 시에도 서버 저장·게이트 이벤트는 상위에서 처리 */
  }
}

export type PosSettlementResponse = {
  systemTotal: number
  systemSubtotal?: number
  systemVat?: number
  systemCashFromOrders?: number
  tillNetForSettleDate?: number
  linkpos?: {
    approvedCount: number
    failedCount: number
    requestedTotal: number
    approvedTotal: number
    cardReportedTotal: number
    diffVsApproved: number
    autoCardBreakdown?: Record<string, number>
    autoQrBreakdown?: Record<string, number>
    autoDeliveryAppBreakdown?: Record<string, number>
    autoDineInDeliveryBreakdown?: Record<string, number>
    autoOtherBreakdown?: Record<string, number>
  } | null
  settlement: PosSettlement | PosSettlement[] | null
  closeRun?: PosCloseRun | null
}

export async function getPosSettlementWithCache(params: {
  settleDate: string
  storeCode?: string
}): Promise<PosSettlementResponse> {
  const { settleDate, storeCode = '' } = params
  const key = cacheKeySettlement(storeCode || 'all', settleDate)

  if (isOnline()) {
    try {
      const data = await getPosSettlement(params)
      try {
        await setCache('pos_sales_cache', key, data)
      } catch {
        /* 캐시 실패해도 서버 응답 우선 */
      }
      return data
    } catch {
      const cached = await getFromCache<PosSettlementResponse>('pos_sales_cache', key)
      return cached ?? EMPTY_SETTLEMENT_RESPONSE()
    }
  }

  const cached = await getFromCache<PosSettlementResponse>('pos_sales_cache', key)
  return cached ?? EMPTY_SETTLEMENT_RESPONSE()
}
