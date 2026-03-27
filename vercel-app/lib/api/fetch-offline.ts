/**
 * apiFetch 오프라인 래퍼 - 네트워크 실패 시 요청 큐 적재, 복구 후 syncPending으로 전송
 * POST/PUT 요청만 큐 적재 (GET은 읽기 전용이라 캐시 사용)
 */

import { apiFetch } from './fetch'
import { addToQueue } from '@/lib/offline/queue'

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message?.toLowerCase().includes('fetch')) return true
  if (e instanceof Error) {
    const msg = e.message?.toLowerCase() ?? ''
    if (
      msg.includes('network') ||
      msg.includes('failed') ||
      msg.includes('load') ||
      msg.includes('internet') ||
      msg.includes('disconnected') ||
      msg.includes('aborted')
    )
      return true
  }
  return false
}

/** API 경로에서 쿼리 제거 후 기본 경로 반환 (예: /api/saveItem?x=1 → /api/saveItem) */
function normalPath(url: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return u.pathname
  } catch {
    return url.split('?')[0] || url
  }
}

/**
 * 큐 적재 가능 API 화이트리스트 (POST/PUT)
 * FormData 사용(파일 업로드) API는 제외 - body 직렬화 불가
 */
const QUEUE_WHITELIST = new Set([
  '/api/addBalanceTransaction',
  '/api/saveCheckResult',
  '/api/savePurchaseOrder',
  '/api/savePoBillingSettings',
  '/api/saveSafetyStock',
  '/api/saveStoreJobHeadcount',
  '/api/adjustStock',
  '/api/processOrder',
  '/api/processUsage',
  '/api/processOrderReceive',
  '/api/processOrderDecision',
  '/api/updateOrderDeliveryDates',
  '/api/updateOrderDeliveryStatus',
  '/api/updateOrderCart',
  '/api/submitAttendance',
  '/api/requestLeave',
  '/api/sendNotice',
  '/api/deleteNoticeAdmin',
  '/api/processLeaveApproval',
  '/api/processAttendanceApproval',
  '/api/createAttendanceFromSchedule',
  '/api/approveNoClockOut',
  '/api/saveWorkLogData',
  '/api/submitDailyClose',
  '/api/updateManagerCheck',
  '/api/updateWorkLogPriority',
  '/api/deleteWorkLogItem',
  '/api/saveSchedule',
  '/api/submitStoreVisit',
  '/api/addPettyCashTransaction',
  '/api/addTillTransaction',
  '/api/updatePettyCashTransaction',
  '/api/deletePettyCashTransaction',
  '/api/saveFixedAsset',
  '/api/runDepreciation',
  '/api/registerExpenseFromBankTransaction',
  '/api/registerPurchaseFromBankTransaction',
  '/api/addExpenseAccrual',
  '/api/updateExpenseRegisterItem',
  '/api/approveExpenseAccrual',
  '/api/updateExpenseAccrual',
  '/api/deleteExpenseAccrualsWithoutStore',
  '/api/deletePurchaseAccrualsByVendor',
  '/api/executeExpensePayment',
  '/api/saveCardAccount',
  '/api/saveCardTransaction',
  '/api/deleteCardAccount',
  '/api/deleteCardTransaction',
  '/api/executeWithdrawal',
  '/api/addBankTransaction',
  '/api/addBankTransactionsBulk',
  '/api/updateBankTransactionInvoice',
  '/api/updateBankTransaction',
  '/api/saveBankTransactionInboundLinks',
  '/api/saveBankMemoRule',
  '/api/deleteBankMemoRule',
  '/api/saveBankAccount',
  '/api/deleteBankAccount',
  '/api/saveAccountSubject',
  '/api/deleteAccountSubject',
  '/api/saveFixedExpense',
  '/api/deleteFixedExpense',
  '/api/saveInteriorProject',
  '/api/deleteInteriorProject',
  '/api/saveInteriorScheduleItem',
  '/api/deleteInteriorScheduleItem',
  '/api/saveInteriorExpenseItem',
  '/api/deleteInteriorExpenseItem',
  '/api/payInteriorExpense',
  '/api/saveInteriorDirectPurchase',
  '/api/deleteInteriorDirectPurchase',
  '/api/deleteInteriorFile',
  '/api/saveInteriorKitchenItem',
  '/api/deleteInteriorKitchenItem',
  '/api/saveInteriorSpecification',
  '/api/deleteInteriorSpecification',
  '/api/saveWarehouseLocation',
  '/api/deleteWarehouseLocation',
  '/api/saveItemCategory',
  '/api/deleteItemCategory',
  '/api/saveItem',
  '/api/deleteItem',
  '/api/backfillPriceHistory',
  '/api/updateItemOrderDisabled',
  '/api/applyPosMenuCategoryPresets',
  '/api/posMenuCategories',
  '/api/savePosMenuOption',
  '/api/savePosMenuIngredient',
  '/api/sauces',
  '/api/sauces/delete',
  '/api/sauces/recalculate',
  '/api/notificationSettings',
  '/api/costSettings',
  '/api/deletePosMenuIngredient',
  '/api/deletePosMenuOption',
  '/api/savePosMenu',
  '/api/deletePosMenu',
  '/api/updatePosMenuSoldOut',
  '/api/savePosCoupon',
  '/api/deletePosCoupon',
  '/api/savePosPromo',
  '/api/savePosPromoItem',
  '/api/deletePosPromo',
  '/api/deletePosPromoItem',
  '/api/savePosDeliveryApps',
  '/api/savePosPaymentSettings',
  '/api/savePosPrinterSettings',
  '/api/savePosTableLayout',
  '/api/savePosSettlement',
  '/api/savePosOrder',
  /** 홀 추가 주문(기존 주문 병합) — 오프라인 시 큐 적재, 복구 후 순차 전송 */
  '/api/updatePosOrder',
  /** 주문 상태(pending→completed 등) — 결제·완료 처리 후 동기화 순서는 sync.ts 참고 */
  '/api/updatePosOrderStatus',
  '/api/saveItemVendors',
  '/api/addChecklistItem',
  '/api/deleteChecklistItem',
  '/api/updateChecklistItems',
  '/api/confirmNoticeRead',
  '/api/saveVendor',
  '/api/deleteVendor',
  '/api/processPurchaseOrderApproval',
  '/api/processPurchaseOrderCancel',
  '/api/updatePurchaseOrderInvoice',
  '/api/addBankTransaction',
  '/api/addExpenseAccrual',
])

/** 큐 적재 시 반환할 fallback - API별 특수 케이스 */
const OFFLINE_FALLBACK: Record<string, unknown> = {
  '/api/saveCheckResult': { result: 'SAVED' },
}

/** 기본 fallback */
const DEFAULT_FALLBACK = { success: true }

/** savePosOrder 5xx/오프라인 시 클라이언트에 줄 응답 (orderNo 표시용) */
function getSavePosOrderFallback(): Record<string, unknown> {
  return { success: true, orderNo: `LOCAL-${Date.now()}` }
}

function canQueue(url: string, init?: RequestInit): boolean {
  const path = normalPath(url)
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false
  if (!QUEUE_WHITELIST.has(path)) return false
  // FormData는 직렬화 불가 → 큐 제외
  const body = init?.body
  if (body instanceof FormData) return false
  return true
}

function getSerializableBody(init?: RequestInit): string | undefined {
  const body = init?.body
  if (body == null) return undefined
  if (typeof body === 'string') return body
  if (body instanceof FormData) return undefined
  try {
    return JSON.stringify(body)
  } catch {
    return undefined
  }
}

/**
 * apiFetch 오프라인 래퍼 - 네트워크 실패 또는 서버/DB 장애(5xx) 시 큐 적재 후 성공 응답 반환
 */
export async function apiFetchWithOffline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.toString()
  const path = normalPath(url)

  const queueAndReturnFallback = async (): Promise<Response> => {
    if (!canQueue(url, init)) throw new Error('Cannot queue this request')
    const body = getSerializableBody(init)
    if (body === undefined) throw new Error('Body not serializable')
    const method = (init?.method || 'POST').toUpperCase()
    await addToQueue({
      api: path.startsWith('/') ? path : `/${path}`,
      method,
      body,
      headers:
        init?.headers instanceof Headers
          ? Object.fromEntries((init.headers as Headers).entries())
          : (init?.headers as Record<string, string>) ?? {},
    })
    const fallback =
      path === '/api/savePosOrder'
        ? getSavePosOrderFallback()
        : (OFFLINE_FALLBACK[path] ?? DEFAULT_FALLBACK)
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /** 브라우저가 오프라인이면 fetch 대기 없이 곧바로 큐 적재 (저장 버튼이 실패로 보이는 현상 완화) */
  if (typeof navigator !== 'undefined' && navigator.onLine === false && canQueue(url, init)) {
    try {
      return await queueAndReturnFallback()
    } catch {
      /* 큐 실패 시 아래에서 일반 fetch 시도 */
    }
  }

  try {
    const res = await apiFetch(input, init)
    // 서버/DB 장애(5xx) 시에도 큐 적재 → Supabase 등 장애 시 오프라인처럼 동작
    if (!res.ok && res.status >= 500 && res.status < 600) {
      try {
        return await queueAndReturnFallback()
      } catch {
        return res
      }
    }
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    try {
      return await queueAndReturnFallback()
    } catch {
      throw e
    }
  }
}
