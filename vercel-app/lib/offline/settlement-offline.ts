/**
 * 영업 결산 API - 오프라인 시 캐시 사용
 * POS 영업관리: 매출 관리와 동일 동작 (인터넷 유무 관계없이 같은 화면)
 */

import { isOnline, shouldPreferOfflineCache } from './network'
import { getFromCache, setCache } from './cache'
import { getPosSettlement, type PosCloseRun, type PosSettlement } from '@/lib/api-client'
import { isPosBusinessOpenRecorded } from '@/lib/pos-business-open-gate'
import { writePosBusinessOpenLocal } from '@/lib/pos-business-open-local'
import { getBangkokDateStr } from '@/lib/pos-business-day'
import { OFFICE_STORES } from '@/lib/permissions'
import { aliasKeysForStore } from '@/lib/store-vendor-tax-link'
import { normStoreKey } from '@/lib/store-list-keys'

/** 영업 시작 저장 직후 POS 터미널 게이트가 캐시·상태를 다시 읽도록 알림 */
export const POS_BUSINESS_OPEN_UPDATED_EVENT = 'cm-pos-business-open-updated'

function cacheKeySettlement(storeCode: string, settleDate: string): string {
  return `settlement:${storeCode}:${settleDate}`
}

function normalizeSettlementSingle(
  settlement: PosSettlement | PosSettlement[] | null | undefined
): PosSettlement | null {
  if (!settlement) return null
  return Array.isArray(settlement) ? settlement[0] ?? null : settlement
}

function uniqueStoreCacheKeys(codes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of codes) {
    const t = String(raw || '').trim()
    if (!t) continue
    const key = normStoreKey(t)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** CM Office ↔ Office 등 — 시제 캐시를 모든 별칭 키에 기록 */
export function settlementStoreCacheKeys(storeCode: string): string[] {
  const trimmed = String(storeCode || '').trim()
  if (!trimmed) return []
  const aliases = aliasKeysForStore(trimmed)
  const probe = normStoreKey(trimmed)
  const officeLike = OFFICE_STORES.some((o) => normStoreKey(o) === probe)
  const officeAliases = officeLike ? OFFICE_STORES.filter(Boolean) : []
  return uniqueStoreCacheKeys([trimmed, ...aliases, ...officeAliases])
}

/** 서버·큐 미반영 시에도 로컬 시제(cash_actual)가 API 응답으로 지워지지 않도록 병합 */
function mergeSettlementWithLocalOpen(
  cached: PosSettlementResponse | null,
  incoming: PosSettlementResponse
): PosSettlementResponse {
  const apiSingle = normalizeSettlementSingle(incoming.settlement)
  const cacheSingle = cached ? normalizeSettlementSingle(cached.settlement) : null
  const apiRecorded = isPosBusinessOpenRecorded(apiSingle)
  const cacheRecorded = isPosBusinessOpenRecorded(cacheSingle)
  if (cacheRecorded && !apiRecorded && cacheSingle) {
    const mergedSingle: PosSettlement = {
      ...(apiSingle ?? {
        storeCode: cacheSingle.storeCode,
        settleDate: cacheSingle.settleDate,
        cardAmt: 0,
        qrAmt: 0,
        deliveryAppAmt: 0,
        otherAmt: 0,
        memo: '',
        closed: false,
      }),
      ...cacheSingle,
      cashActual: cacheSingle.cashActual,
    }
    return { ...incoming, settlement: mergedSingle }
  }
  return incoming
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
    const settleDate = String(params.settleDate || '').trim().slice(0, 10)
    if (!settleDate) return
    const storeKeys = settlementStoreCacheKeys(params.storeCode)
    if (storeKeys.length === 0) return

    for (const storeCode of storeKeys) {
      const key = cacheKeySettlement(storeCode, settleDate)
      const cached =
        (await getFromCache<PosSettlementResponse>('pos_sales_cache', key)) ?? EMPTY_SETTLEMENT_RESPONSE()
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
    }
  } catch {
    /* IndexedDB 불능 시에도 서버 저장·게이트 이벤트는 상위에서 처리 */
  }
}

/** 영업 시작 저장 — IndexedDB·sessionStorage·게이트 이벤트 일괄 반영 */
export async function persistPosBusinessOpenAfterSave(params: {
  storeCode: string
  /** 영업일(게이트 기준). 달력일과 다를 수 있어 둘 다 넘기면 캐시 키를 모두 기록 */
  settleDates: string[]
  cashActual: number
}): Promise<void> {
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode || !Number.isFinite(params.cashActual)) return
  const dates = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of params.settleDates) {
      const d = String(raw || '').trim().slice(0, 10)
      if (!d || seen.has(d)) continue
      seen.add(d)
      out.push(d)
    }
    return out
  })()
  if (dates.length === 0) return

  for (const settleDate of dates) {
    await applyPosSettlementSaveToCache({
      storeCode,
      settleDate,
      cashActual: params.cashActual,
    })
    writePosBusinessOpenLocal({ storeCode, settleDate, cashActual: params.cashActual })
  }
  dispatchPosBusinessOpenUpdated({ storeCode, settleDate: dates[0] })
}

/** 영업 시작 저장 시 기록할 settleDate 후보 (영업일 + 달력일) */
export function resolvePosBusinessOpenSettleDates(
  businessDateYmd: string,
  base: Date = new Date()
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [businessDateYmd, getBangkokDateStr(base)]) {
    const d = String(raw || '').trim().slice(0, 10)
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
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

  const readCached = async () =>
    getFromCache<PosSettlementResponse>('pos_sales_cache', key)

  if (shouldPreferOfflineCache()) {
    const cached = await readCached()
    if (cached) return cached
  }

  if (isOnline()) {
    try {
      const data = await getPosSettlement(params)
      const cached = await readCached()
      const merged = mergeSettlementWithLocalOpen(cached, data)
      try {
        await setCache('pos_sales_cache', key, merged)
      } catch {
        /* 캐시 실패해도 병합 응답 반환 */
      }
      return merged
    } catch {
      const cached = await readCached()
      return cached ?? EMPTY_SETTLEMENT_RESPONSE()
    }
  }

  const cached = await readCached()
  return cached ?? EMPTY_SETTLEMENT_RESPONSE()
}
