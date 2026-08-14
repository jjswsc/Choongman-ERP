/**
 * POS 주문·영업일·주문 변경 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'
import type { PosAppliedCoupon } from './pos-operations'
import type { LinkposPaymentSummary } from './pos-payment-gateways'

export interface PosOrderItem {
  id: string
  name: string
  price: number
  qty: number
  /** 주문 저장 시점 메뉴별 할인 스냅샷(손님 영수증 우선 표시) */
  lineDiscountAmt?: number
  /** 일부 `items_json`·연동은 quantity 만 사용 (서버/클라이언트에서 qty 와 병용 해석) */
  quantity?: number
  /** 줄 단위 메모 (주방·영수증) */
  note?: string
  servedAt?: string | null
  servedBy?: string | null
  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null
  orderType?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  setChildrenState?: Record<
    string,
    {
      servedAt?: string | null
      servedBy?: string | null
      packedAt?: string | null
      packedBy?: string | null
    }
  >
  menuId?: string
  optionId?: string
  optionCode?: string
  menuId1?: string
  optionId1?: string
  optionCode1?: string
  menuId2?: string
  optionId2?: string
  optionCode2?: string
}

export interface PosOrder {
  id: number
  orderNo: string
  storeCode: string
  orderType: string
  /** pos_orders.order_type (메모·채널 추론 전 DB 값) — 테이블 점유 매칭용 */
  dbOrderType?: string
  tableName: string
  memo: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  cardRate?: number
  paymentCash?: number
  /** 현금 받은 금액(손님 영수증 거스름 표시) */
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD' | 'EDC'
  paymentOther?: number
  /** payment_other 세부(트루머니·위챗·관리자 지갑 등). 합계는 payment_other 와 일치 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  /** 배달앱(Grab/Line Man/Shopee 등) 플랫폼 결제 금액 */
  paymentDeliveryApp?: number
  /** grab | lineman | shopee | dine_in */
  deliveryPaymentChannel?: string
  /** pos_orders.delivery_app_code — POS 수동 배달·연동 주문의 플랫폼 구분 */
  deliveryAppCode?: string
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  pointUsed?: number
  pointEarned?: number
  /** 홀 주문 인원(포장/배달 등은 0) */
  guestCount?: number
  items: PosOrderItem[]
  subtotal: number
  vat: number
  total: number
  status: string
  createdAt: string
  /** 결제·수정 시각(DB updated_at). 결제 완료 시각 추정에 사용 */
  updatedAt?: string
  /** 최초 결제 완료 시각(DB paid_at). 영수증 관리 결제일시 표시용 */
  paidAt?: string
  linkposProvider?: string
  linkposMode?: string
  linkposTxCode?: string
  linkposBankId?: string
  linkposResponseCode?: string
  linkposApprovalCode?: string
  linkposTraceNo?: string
  linkposRefNo?: string
  linkposTerminalId?: string
  linkposMerchantId?: string
  linkposReference1?: string
  linkposRequestedAmount?: number
  linkposApprovedAmount?: number
  linkposRequestedAt?: string
  linkposRespondedAt?: string
}

export async function getPosTodaySales(params?: {
  storeCode?: string
  startStr?: string
  endStr?: string
  /** true면 IDB 즉시 반환 없이 네트워크 조회를 기다림(헤더 새로고침 등) */
  forceNetwork?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  /** 수동 새로고침 — 브라우저·중간 캐시가 동일 URL을 재사용하지 않도록 */
  if (params?.forceNetwork) q.set('_', String(Date.now()))
  const qs = q.toString()
  const url = '/api/getPosTodaySales' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posTodaySales:${params?.storeCode?.trim() || ''}:${params?.startStr?.trim() || ''}:${params?.endStr?.trim() || ''}`
  const fallback = {
    completedCount: 0,
    completedTotal: 0,
    completedCash: 0,
    pendingCount: 0,
  }
  return fetchPosCatalogCached<{
    completedCount: number
    completedTotal: number
    completedCash: number
    pendingCount: number
  }>(cacheKey, url, fallback, { forceNetwork: Boolean(params?.forceNetwork) })
}

export async function getPosReversalJournals(params: {
  startStr: string
  endStr: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosReversalJournals?' + q.toString())
  const data = (await res.json()) as {
    success?: boolean
    rows?: {
      id: number
      accountingDate: string
      posOrderId: number
      storeCode: string
      memo: string
      postedAt: string
    }[]
    message?: string
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `HTTP ${res.status}`)
  }
  return Array.isArray(data.rows) ? data.rows : []
}

export async function getPosOrders(params?: {
  startStr?: string
  endStr?: string
  /** 단일 영업일(YYYY-MM-DD) 조회 시 POS 영업일 경계(설정된 시작 시각~익일 동시각)로 UTC 구간 적용 */
  posBizDayScope?: boolean
  storeCode?: string
  status?: string
  strictStore?: boolean
  /** 임시 디버그: getPosOrders 상세 서버 로그 출력 */
  debugPosOrders?: boolean
  sinceId?: number
  /** 단건 조회(결제 영수증 동기화 등). 지정 시 날짜·sinceId 없이 id 우선 조회 */
  orderId?: number
  /** status가 paid 또는 completed 인 행만 (OR). 메인 기기 결제 영수증 폴링 등 */
  statusPaidLike?: boolean
  orderBy?: 'created_at.desc' | 'id.desc' | 'updated_at.desc'
  /** 목록 조회 시 행 수 상한(서버에서 최대 2000으로 캡) */
  limit?: number
  /** 메인 POS 폴링용 — linkpos 등 대형 컬럼 제외 select */
  pollMinimal?: boolean
  /** items_json 없는 초경량 감지용 (신규 id·updated_at) */
  pollHeads?: boolean
}): Promise<PosOrder[]> {
  const q = new URLSearchParams()
  if (params?.orderId != null && params.orderId > 0) q.set('orderId', String(params.orderId))
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.posBizDayScope) q.set('posBizDayScope', '1')
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.status) q.set('status', params.status)
  if (params?.strictStore) q.set('strictStore', '1')
  if (params?.debugPosOrders) q.set('debugPosOrders', '1')
  if (params?.sinceId != null && params.sinceId > 0) q.set('sinceId', String(params.sinceId))
  if (params?.statusPaidLike) q.set('statusPaidLike', '1')
  if (params?.orderBy) q.set('orderBy', params.orderBy)
  if (params?.limit != null && params.limit > 0) q.set('limit', String(params.limit))
  if (params?.pollHeads) q.set('pollHeads', '1')
  else if (params?.pollMinimal) q.set('pollMinimal', '1')
  const res = await apiFetchWithOffline('/api/getPosOrders?' + q.toString())
  if (res.status === 204) return []
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosOrder[]
}

export type PosBusinessDayStartDto = { hour: number; minute: number }

export type PosBusinessDaySettingsDto = PosBusinessDayStartDto & {
  endHour: number
  endMinute: number
  scope?: 'store_override' | 'org_default'
  storeCode?: string | null
  hasStoreOverride?: boolean
  globalHour?: number
  globalMinute?: number
  globalEndHour?: number
  globalEndMinute?: number
  defaultHour?: number
  defaultMinute?: number
  defaultEndHour?: number
  defaultEndMinute?: number
}

function posBusinessDaySettingsCacheKey(storeCode?: string | null): string {
  return String(storeCode ?? '').trim().toLowerCase() || '__global__'
}

const posBusinessDaySettingsInflight = new Map<string, Promise<PosBusinessDaySettingsDto>>()
/** 영업일 설정은 자주 바뀌지 않음 — 탭·컴포넌트 중복 마운트 시 Edge Request 절감 */
const POS_BUSINESS_DAY_SETTINGS_CLIENT_TTL_MS = 5 * 60 * 1000
const posBusinessDaySettingsMemory = new Map<
  string,
  { fetchedAt: number; value: PosBusinessDaySettingsDto }
>()

/** 저장 직후·수동 새로고침 — in-flight dedupe + 메모리 TTL 캐시 초기화 */
export function invalidatePosBusinessDaySettingsClientInflight(): void {
  posBusinessDaySettingsInflight.clear()
  posBusinessDaySettingsMemory.clear()
}

async function fetchPosBusinessDaySettingsDto(
  storeCode?: string | null
): Promise<PosBusinessDaySettingsDto> {
  const q = storeCode?.trim() ? `?storeCode=${encodeURIComponent(String(storeCode).trim())}` : ''
  const res = await fetch('/api/posBusinessDaySettings' + q, { cache: 'no-store' })
  const j = (await res.json().catch(() => null)) as Partial<PosBusinessDaySettingsDto> | null
  const hour = Number(j?.hour)
  const minute = Number(j?.minute ?? 0)
  const base =
    !Number.isFinite(hour)
      ? { hour: POS_BUSINESS_DAY_DEFAULT_START.hour, minute: POS_BUSINESS_DAY_DEFAULT_START.minute }
      : { hour: Math.min(23, Math.max(0, Math.trunc(hour))), minute: Math.min(59, Math.max(0, Math.trunc(minute))) }
  const ehRaw = Number(j?.endHour)
  const emRaw = Number(j?.endMinute ?? 0)
  const end =
    !Number.isFinite(ehRaw)
      ? { hour: base.hour, minute: base.minute }
      : {
          hour: Math.min(23, Math.max(0, Math.trunc(ehRaw))),
          minute: Math.min(59, Math.max(0, Math.trunc(emRaw))),
        }
  const def = POS_BUSINESS_DAY_DEFAULT_HOURS.start
  const defEnd = POS_BUSINESS_DAY_DEFAULT_HOURS.end
  return {
    ...base,
    endHour: end.hour,
    endMinute: end.minute,
    scope: j?.scope === 'store_override' ? 'store_override' : 'org_default',
    storeCode: j?.storeCode ?? null,
    hasStoreOverride: Boolean(j?.hasStoreOverride),
    globalHour: Number.isFinite(Number(j?.globalHour)) ? Math.trunc(Number(j?.globalHour)) : def.hour,
    globalMinute: Number.isFinite(Number(j?.globalMinute)) ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalMinute)))) : def.minute,
    globalEndHour: Number.isFinite(Number(j?.globalEndHour)) ? Math.trunc(Number(j?.globalEndHour)) : defEnd.hour,
    globalEndMinute: Number.isFinite(Number(j?.globalEndMinute))
      ? Math.min(59, Math.max(0, Math.trunc(Number(j?.globalEndMinute))))
      : defEnd.minute,
    defaultHour: def.hour,
    defaultMinute: def.minute,
    defaultEndHour: defEnd.hour,
    defaultEndMinute: defEnd.minute,
  }
}

export async function getPosBusinessDaySettings(storeCode?: string | null): Promise<PosBusinessDaySettingsDto> {
  const key = posBusinessDaySettingsCacheKey(storeCode)
  const cached = posBusinessDaySettingsMemory.get(key)
  if (cached && Date.now() - cached.fetchedAt < POS_BUSINESS_DAY_SETTINGS_CLIENT_TTL_MS) {
    return cached.value
  }
  const pending = posBusinessDaySettingsInflight.get(key)
  if (pending) return pending
  const promise = fetchPosBusinessDaySettingsDto(storeCode)
    .then((value) => {
      posBusinessDaySettingsMemory.set(key, { fetchedAt: Date.now(), value })
      return value
    })
    .finally(() => {
      if (posBusinessDaySettingsInflight.get(key) === promise) {
        posBusinessDaySettingsInflight.delete(key)
      }
    })
  posBusinessDaySettingsInflight.set(key, promise)
  return promise
}

export async function savePosBusinessDaySettings(params: {
  hour: number
  minute: number
  endHour?: number
  endMinute?: number
  /** 없으면 전사 기본값(본사만) */
  storeCode?: string | null
  /** true 이면 해당 매장 덮어쓰기 제거 */
  resetStoreOverride?: boolean
}): Promise<{ success: boolean; message?: string }> {
  const body: Record<string, unknown> = {}
  if (params.resetStoreOverride) {
    body.reset = true
    body.storeCode = params.storeCode ?? ''
  } else {
    body.hour = params.hour
    body.minute = params.minute
    body.endHour = params.endHour ?? params.hour
    body.endMinute = params.endMinute ?? params.minute
    if (params.storeCode != null && String(params.storeCode).trim()) body.storeCode = String(params.storeCode).trim()
  }
  const res = await fetch('/api/posBusinessDaySettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  if (j?.success) invalidatePosBusinessDaySettingsClientInflight()
  return { success: Boolean(j?.success), message: j?.message }
}
export async function updatePosOrder(params: {
  id: number
  /**
   * Omni 결제 단축(skipPostPaymentSideEffects)에서는 생략 가능 — settleFast 가 items 를 무시한다.
   * 충만·일반 수정은 필수.
   */
  items?: PosOrderItem[]
  /** 결제 단말 매장 — 주문 store_code와 시재 store_code 불일치 시 영업 시작 폴백 */
  terminalStoreCode?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD' | 'EDC'
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  /** true면 미결제 QR 대기 취소 시 결제금액 0 덮어쓰기 (기존 결제 보존 가드 우회) */
  clearPaymentTender?: boolean
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  tierDiscountAmt?: number
  memberTierCode?: string
  /** 협업 할인 금액 */
  collabDiscountAmt?: number
  /** 협업 캠페인 ID (marketing_campaigns.id) */
  collabCampaignId?: number | string
  pointUsed?: number
  pointEarned?: number
  guestCount?: number
  linkposPayment?: LinkposPaymentSummary | null
  /**
   * true면 결제 완료 시 포인트 적립·LINE 알림을 건너뜀.
   * Omni 결제 단축 경로에서만 사용(이어서 updatePosOrderStatus가 적립 후처리).
   * 충만 클라이언트는 보내지 않음 → 기존 동기 적립 유지.
   */
  skipPostPaymentSideEffects?: boolean
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
    feeStackMode?: 'parallel' | 'sequential'
    feeStackOrder?: Array<'vat' | 'service' | 'other'>
    paymentTotalRoundingMode?: 'round' | 'floor' | 'none'
  }
}) {
  const body: Record<string, unknown> = { ...params }
  if (params.skipPostPaymentSideEffects) {
    /** Omni settleFast는 items를 무시. pricingAdjustments는 QR·합석 합계 재계산에 필요. */
    delete body.items
  }
  const res = await apiFetchWithOffline('/api/updatePosOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    pointEarned?: number
    memberId?: number
    memberNo?: string
    memberPhone?: string
    memberTierCode?: string
    memberPointBalance?: number
  }>
}

/** 영수증 관리: 당일(방콕) 결제 반영 주문의 결제 수단 분해 정정(필요 시 total·과세 스냅샷 비율 조정). 오프라인 시 큐 동기화 필요 */
export async function correctPosOrderPayment(params: {
  id: number
  reason: string
  /** 생략 시 기존 주문 total 유지(결제 분할만 정정) */
  total?: number
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  /** 생략 시 기존 DB breakdown 을 새 payment_other 에 맞게 재검증·유지 */
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp: number
  deliveryPaymentChannel?: string | null
}) {
  const res = await apiFetchWithOffline('/api/correctPosOrderPayment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    settlementSync?: {
      status: 'no_settlement' | 'already_matched' | 'synced'
      closed: boolean
      settleDate: string
      liveCash: number
      savedCashBefore: number | null
      savedCashAfter: number | null
    } | null
    settlementSyncError?: string | null
  }>
}

/** 홀 주문: 빈 테이블로 이동 (table_name만 변경) */
export async function posDineInTableMove(params: { orderId: number; targetTableName: string }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'move',
      orderId: params.orderId,
      targetTableName: params.targetTableName,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 포장 주문 → 빈 홀 테이블 (order_type takeout→dine_in, table_name 지정) */
export async function posTakeoutToTable(params: { orderId: number; targetTableName: string }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'takeout_to_table',
      orderId: params.orderId,
      targetTableName: params.targetTableName,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/**
 * 홀 주문 합석: keep는 매장(dine_in)만. absorb는 매장 또는 포장(takeout) — 포장은 이 테이블 청구서로만 합침.
 * keep에 absorb 품목·인원 등을 합치고 absorb는 cancelled + `[ORDER_MERGED …]` 메모. 결제 반영된 주문은 합석 불가(API).
 */
export async function posDineInTableMerge(params: { keepOrderId: number; absorbOrderId: number }) {
  const res = await apiFetchWithOffline('/api/posDineInTableActions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'merge',
      keepOrderId: params.keepOrderId,
      absorbOrderId: params.absorbOrderId,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosOrderStatusUpdateResult = {
  success: boolean
  message?: string
  retryAfterQueue?: boolean
  statusAlreadyApplied?: boolean
  failedSideEffects?: string[]
}

export type PosOrderAuditTrailRow = {
  id: number
  changedAt: string
  orderId: number
  orderNo: string
  storeCode: string
  actionType: string
  changedBy: string
  changedByRole: string
  changedByStore: string
  changedByEmployeeCode: string
  changedByEmployeeId: number | null
  changeSource: string
  reason: string
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  changedFields: Array<{ field: string; before: unknown; after: unknown }>
}

export async function getPosOrderAuditTrail(params: {
  startStr: string
  endStr: string
  employee?: string
  orderNo?: string
  store?: string
  limit?: number
}) {
  const q = new URLSearchParams()
  q.set('startStr', params.startStr)
  q.set('endStr', params.endStr)
  if (params.employee) q.set('employee', params.employee)
  if (params.orderNo) q.set('orderNo', params.orderNo)
  if (params.store) q.set('store', params.store)
  if (params.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline(`/api/getPosOrderAuditTrail?${q.toString()}`)
  const json = (await res.json().catch(() => ({}))) as { rows?: Record<string, unknown>[] }
  const rows = Array.isArray(json.rows) ? json.rows : []
  return rows.map((r) => ({
    id: Number(r.id || 0),
    changedAt: String(r.changed_at || ''),
    orderId: Number(r.order_id || 0),
    orderNo: String(r.order_no || ''),
    storeCode: String(r.store_code || ''),
    actionType: String(r.action_type || ''),
    changedBy: String(r.changed_by || ''),
    changedByRole: String(r.changed_by_role || ''),
    changedByStore: String(r.changed_by_store || ''),
    changedByEmployeeCode: String(r.changed_by_employee_code || ''),
    changedByEmployeeId:
      r.changed_by_employee_id != null && Number.isFinite(Number(r.changed_by_employee_id))
        ? Number(r.changed_by_employee_id)
        : null,
    changeSource: String(r.change_source || ''),
    reason: String(r.reason || ''),
    beforeJson:
      r.before_json && typeof r.before_json === 'object' && !Array.isArray(r.before_json)
        ? (r.before_json as Record<string, unknown>)
        : null,
    afterJson:
      r.after_json && typeof r.after_json === 'object' && !Array.isArray(r.after_json)
        ? (r.after_json as Record<string, unknown>)
        : null,
    changedFields: Array.isArray(r.changed_fields_json)
      ? (r.changed_fields_json as Array<{ field: string; before: unknown; after: unknown }>)
      : [],
  })) as PosOrderAuditTrailRow[]
}

export async function updatePosOrderStatus(params: {
  id: number
  status: string
  grabState?: string
  /** 취소·환불 시 pos_orders.memo 에 감사 로그 한 줄 추가 */
  memoAppend?: string
  retrySideEffects?: boolean
}) {
  const res = await apiFetchWithOffline('/api/updatePosOrderStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<PosOrderStatusUpdateResult>
}

export type PosKitchenPrintJobClaim = {
  id: number
  order_id: number
  payload_json: Record<string, unknown> | null
}

export async function claimKitchenPrintJob(params: {
  storeCode: string
  workerId?: string
}): Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/claimKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; job: PosKitchenPrintJobClaim | null; message?: string }>
}

export async function markKitchenPrintJob(params: {
  jobId: number
  status: 'printed' | 'failed'
  reason?: string
}): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetchWithOffline('/api/posPrintJobs/markKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabMarkOrderReadyApi(params: { orderID: string; markStatus: 1 | 2 }) {
  const res = await apiFetchWithOffline('/api/grab/markOrderReady', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function grabCancelOrderByStoreApi(params: {
  orderID: string
  storeCode?: string
  merchantID?: string
  cancelCode?: 1001 | 1002 | 1003 | 1004
}) {
  const res = await apiFetchWithOffline('/api/grab/cancelOrderByStore', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function markPosOrderItemServed(params: {
  id: number
  itemId: string
  served: boolean
  mode?: 'served' | 'packed'
  childKey?: string
  servedBy?: string
  cancelled?: boolean
  cancelledBy?: string
  cancelReason?: string
}) {
  const res = await apiFetchWithOffline('/api/markPosOrderItemServed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    servedCount?: number
    totalCount?: number
    cancelledCount?: number
    childServedCount?: number
    childTotalCount?: number
  }>
}
export async function savePosOrder(params: {
  storeCode?: string
  /** 주문 접수·결제한 담당자(담당자별 조회용) */
  createdBy?: string
  orderType?: string
  tableName?: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  serviceAmt?: number
  serviceReason?: string
  deliveryFee?: number
  packagingFee?: number
  paymentCash?: number
  paymentCashTendered?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  appliedCoupons?: PosAppliedCoupon[]
  tierDiscountAmt?: number
  memberTierCode?: string
  /** 협업 할인 금액 */
  collabDiscountAmt?: number
  /** 협업 캠페인 ID (marketing_campaigns.id) */
  collabCampaignId?: number | string
  pointUsed?: number
  pointEarned?: number
  /** 홀 dine_in 시 권장. 미입력 시 0 */
  guestCount?: number
  /** 배달 주문 시 pos_orders.delivery_app_code (예: grab, lineman) */
  deliveryAppCode?: string
  /**
   * 클라이언트 멱등 키(선택). 있으면 `X-Idempotency-Key`·바디 `localOrderNo`로 전달되어 동일 제출 중복 저장을 막는다.
   */
  localOrderNo?: string
  /**
   * 결제 합계가 total 에 도달할 때 저장 직후 주문 상태 (오프라인 동기화 시 updatePosOrderStatus 생략용).
   * 서버에서 payment 합계·total 로 검증 후 적용.
   */
  closeStatus?: 'paid' | 'completed'
  /** 카드 승인 완료 메타 (KBTG LINKPOS) */
  linkposPayment?: LinkposPaymentSummary | null
  /** KBank QR 생성 시 발급된 partnerTransactionId (주문 저장 후 결제 시도 연결용) */
  kbankPartnerTransactionId?: string | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
    feeStackMode?: 'parallel' | 'sequential'
    feeStackOrder?: Array<'vat' | 'service' | 'other'>
  }
  items: PosOrderItem[]
}) {
  const idem = String(params.localOrderNo ?? '').trim()
  const res = await apiFetchWithOffline('/api/savePosOrder', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idem ? { 'X-Idempotency-Key': idem } : {}),
    },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    orderId?: number
    orderNo?: string
    message?: string
    pointEarned?: number
    memberId?: number
    memberNo?: string
    memberPhone?: string
    memberTierCode?: string
    memberPointBalance?: number
  }>
}
