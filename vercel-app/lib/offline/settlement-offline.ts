/**
 * 영업 결산 API - 오프라인 시 캐시 사용
 * POS 영업관리: 매출 관리와 동일 동작 (인터넷 유무 관계없이 같은 화면)
 */

import { isOnline } from './network'
import { getFromCache, setCache } from './cache'
import { getPosSettlement, type PosSettlement } from '@/lib/api-client'

function cacheKeySettlement(storeCode: string, settleDate: string): string {
  return `settlement:${storeCode}:${settleDate}`
}

export type PosSettlementResponse = {
  systemTotal: number
  systemSubtotal?: number
  systemVat?: number
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
      await setCache('pos_sales_cache', key, data)
      return data
    } catch {
      const cached = await getFromCache<PosSettlementResponse>('pos_sales_cache', key)
      return (
        cached ?? {
          systemTotal: 0,
          systemSubtotal: 0,
          systemVat: 0,
          linkpos: null,
          settlement: null,
        }
      )
    }
  }

  const cached = await getFromCache<PosSettlementResponse>('pos_sales_cache', key)
  return (
    cached ?? {
      systemTotal: 0,
      systemSubtotal: 0,
      systemVat: 0,
      linkpos: null,
      settlement: null,
    }
  )
}
