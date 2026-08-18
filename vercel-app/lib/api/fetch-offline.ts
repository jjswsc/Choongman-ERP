/**
 * apiFetch 오프라인 래퍼 - 네트워크 실패 시 요청 큐 적재, 복구 후 syncPending으로 전송
 * POST/PUT 요청만 큐 적재 (GET은 읽기 전용이라 캐시 사용)
 */

import { isNonRetryableBankBusinessErrorMessage } from '@/lib/bank-import-deposit-category'
import { isNonRetryableExpenseAccrualErrorMessage } from '@/lib/payable-vendor-code'
import { apiFetch } from './fetch'
import { addToQueue } from '@/lib/offline/queue'
import {
  isBrowserOnline,
  isNetworkDegraded,
  reportNetworkFailure,
  reportNetworkSuccess,
  shouldPreferOfflineCache,
} from '@/lib/offline/network'

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
      msg.includes('aborted') ||
      msg.includes('enotfound') ||
      msg.includes('getaddrinfo') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('supabase.co')
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
const LEGACY_QUEUE_WHITELIST = new Set([
  '/api/addBalanceTransaction',
  '/api/saveCheckResult',
  '/api/savePurchaseOrder',
  '/api/savePoBillingSettings',
  '/api/savePayroll',
  '/api/saveEvaluationResult',
  '/api/deleteEvaluationResult',
  '/api/saveAccountingWorkflowStatus',
  '/api/saveAccountingFilingPreferences',
  '/api/saveStoreRepairTicket',
  '/api/saveHeadOfficeInfo',
  '/api/saveComplaintLog',
  '/api/savePublicHoliday',
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
  '/api/updateNoticeAdmin',
  '/api/remindNoticeUnread',
  '/api/applyNoticeUnreadAllowanceExclusion',
  '/api/estimateNoticeRecipients',
  '/api/noticeTemplates',
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
  '/api/registerCardExpenseFromBankTransaction',
  '/api/markBankTransactionForCardBill',
  '/api/markBankTransactionForPettyCash',
  '/api/registerPettyReplenishFromBankTransaction',
  '/api/saveCardBillAllocation',
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
  '/api/savePosPaymentMethodItem',
  '/api/savePosLinkposTenderRule',
  '/api/savePosMenuBoard',
  '/api/savePosMenuScreenConfig',
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
  /** 재고 차감 강제 실행(운영/복구용) — 오프라인 시 큐 적재 */
  '/api/processPosStockDeduction',
  /** 라인별 서빙/포장 완료 표시 — 오프라인 시 큐 적재 */
  '/api/markPosOrderItemServed',
  /** 홀 테이블 이동/합석 — 오프라인 시 큐 적재 후 순차 복구 */
  '/api/posDineInTableActions',
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
  '/api/syncOrderReceivable',
  '/api/syncOrderReceivableFromOutbound',
  '/api/syncAllOrderReceivables',
  '/api/syncAllOrderReceivablesFromOutbound',
])

function getQueueDomain(path: string): 'pos' | 'erp' | 'accounting' | 'hr' | null {
  if (
    path.startsWith('/api/savePos') ||
    path.startsWith('/api/updatePos') ||
    path.startsWith('/api/markPos') ||
    path.startsWith('/api/processPos') ||
    path.startsWith('/api/posDineIn') ||
    path === '/api/addTillTransaction' ||
    path === '/api/deleteTillTransaction'
  ) {
    return 'pos'
  }
  if (
    path.startsWith('/api/addBank') ||
    path.startsWith('/api/updateBank') ||
    path.startsWith('/api/saveBank') ||
    path.startsWith('/api/executeWithdrawal') ||
    path.startsWith('/api/executeExpensePayment') ||
    path.startsWith('/api/saveCard') ||
    path.startsWith('/api/deleteCard') ||
    path.startsWith('/api/saveAccountSubject') ||
    path.startsWith('/api/deleteAccountSubject')
  ) {
    return 'accounting'
  }
  if (
    path.startsWith('/api/submitAttendance') ||
    path.startsWith('/api/requestLeave') ||
    path.startsWith('/api/processLeaveApproval') ||
    path.startsWith('/api/processAttendanceApproval') ||
    path.startsWith('/api/saveWorkLog')
  ) {
    return 'hr'
  }
  if (
    path.startsWith('/api/save') ||
    path.startsWith('/api/update') ||
    path.startsWith('/api/delete') ||
    path.startsWith('/api/process')
  ) {
    return 'erp'
  }
  return null
}

/** 큐 적재 시 반환할 fallback - API별 특수 케이스 */
const OFFLINE_FALLBACK: Record<string, unknown> = {
  '/api/saveCheckResult': { result: 'SAVED' },
}

/** 기본 fallback */
const DEFAULT_FALLBACK = { success: true, queued: true }

function canQueue(url: string, init?: RequestInit): boolean {
  const path = normalPath(url)
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false
  const domain = getQueueDomain(path)
  if (!domain && !LEGACY_QUEUE_WHITELIST.has(path)) return false
  // FormData는 직렬화 불가 → 큐 제외
  const body = init?.body
  if (body instanceof FormData) return false
  return true
}

const BANK_NON_QUEUE_PATHS = new Set([
  '/api/addBankTransactionsBulk',
  '/api/addBankTransaction',
  '/api/updateBankTransaction',
])

function shouldQueueHttpError(path: string, status: number, bodyText: string): boolean {
  if (status < 500 || status >= 600) {
    if (status >= 400 && status < 500 && BANK_NON_QUEUE_PATHS.has(path)) return false
    return status >= 500
  }
  if (!BANK_NON_QUEUE_PATHS.has(path)) {
    if (path === '/api/addExpenseAccrual' && isNonRetryableExpenseAccrualErrorMessage(bodyText)) {
      return false
    }
    return true
  }
  try {
    const j = JSON.parse(bodyText) as { success?: boolean; message?: string }
    if (j?.success === false && isNonRetryableBankBusinessErrorMessage(j.message)) return false
    const msg = String(j?.message ?? bodyText)
    if (isNonRetryableBankBusinessErrorMessage(msg)) return false
  } catch {
    if (isNonRetryableBankBusinessErrorMessage(bodyText)) return false
  }
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
    let localOrderNo: string | undefined
    if (path === '/api/savePosOrder') {
      try {
        const parsed = JSON.parse(body) as { localOrderNo?: unknown; local_order_no?: unknown }
        const fromBody =
          String(parsed?.localOrderNo ?? parsed?.local_order_no ?? '')
            .trim() || ''
        localOrderNo = fromBody || `LOCAL-${Date.now()}`
      } catch {
        localOrderNo = `LOCAL-${Date.now()}`
      }
    }
    await addToQueue({
      api: path.startsWith('/') ? path : `/${path}`,
      method,
      body,
      headers:
        init?.headers instanceof Headers
          ? Object.fromEntries((init.headers as Headers).entries())
          : (init?.headers as Record<string, string>) ?? {},
      metadata: {
        ...(localOrderNo ? { localOrderNo } : {}),
        domainTag: getQueueDomain(path) ?? 'unknown',
        queuePath: path,
      },
    })
    const fallback =
      path === '/api/savePosOrder' && localOrderNo
        ? { success: true, orderNo: localOrderNo, queued: true }
        : (OFFLINE_FALLBACK[path] ?? DEFAULT_FALLBACK)
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Offline-Queued': '1',
      },
    })
  }

  /** 오프라인/심각한 degraded 상태면 fetch 대기 없이 곧바로 큐 적재 */
  if ((!isBrowserOnline() || isNetworkDegraded() || shouldPreferOfflineCache()) && canQueue(url, init)) {
    try {
      return await queueAndReturnFallback()
    } catch {
      /* 큐 실패 시 아래에서 일반 fetch 시도 */
    }
  }

  try {
    const res = await apiFetch(input, init)
    if (res.ok) {
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json') && canQueue(url, init)) {
        const POS_RETRY_AFTER_QUEUE = new Set([
          '/api/savePosOrder',
          '/api/updatePosOrder',
          '/api/updatePosOrderStatus',
          '/api/markPosOrderItemServed',
          // savePosSettlement: 200 + success:false 는 대개 스키마/검증 오류 → 큐에 넣어도 재성공하지 않음.
          // 오프라인은 네트워크 예외·5xx 경로에서만 큐 적재한다.
          '/api/processPosStockDeduction',
        ])
        if (POS_RETRY_AFTER_QUEUE.has(path)) {
          try {
            const j = (await res.clone().json()) as {
              success?: boolean
              retryAfterQueue?: boolean
            }
            if (j?.success === false && j?.retryAfterQueue === true) {
              reportNetworkFailure()
              try {
                return await queueAndReturnFallback()
              } catch {
                /* 원 응답 유지 */
              }
            }
          } catch {
            /* JSON 파싱 실패 시 아래에서 성공 처리 */
          }
        }
      }
      reportNetworkSuccess()
    }
    // 서버/DB 장애(5xx) 시에도 큐 적재 → Supabase 등 장애 시 오프라인처럼 동작
    // 단, 통장 검증 거절(이중 매출 등)은 재시도해도 성공하지 않으므로 큐에 넣지 않음
    if (!res.ok && (res.status >= 500 || (res.status >= 400 && BANK_NON_QUEUE_PATHS.has(path)))) {
      const bodyText = await res.clone().text().catch(() => '')
      if (shouldQueueHttpError(path, res.status, bodyText)) {
        reportNetworkFailure()
        try {
          return await queueAndReturnFallback()
        } catch {
          return res
        }
      }
    }
    return res
  } catch (e) {
    if (!isNetworkError(e)) throw e
    reportNetworkFailure()
    try {
      return await queueAndReturnFallback()
    } catch {
      throw e
    }
  }
}
