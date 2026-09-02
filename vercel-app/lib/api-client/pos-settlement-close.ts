/**
 * POS 정산·마감·채널 정산 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface PosSettlement {
  id?: number
  storeCode: string
  settleDate: string
  cashActual: number | null
  /** 돈통 시제 권종별 장 수(키 1000,500,…). DB `cash_actual_denoms` */
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt: number
  cardBreakdown?: Record<string, number>
  qrAmt: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt: number
  deliveryAppBreakdown?: Record<string, number>
  /** 매장 홀에서 배달앱 탭·Dine in 채널 (플랫폼 배달과 별도) */
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt: number
  otherBreakdown?: Record<string, number>
  cryptoAmt?: number
  memo: string
  closed: boolean
}

export interface PosCloseRun {
  id: number
  status: 'draft' | 'validated' | 'locked' | 'posted'
  checks: Record<string, unknown>
  totals: Record<string, unknown>
  settlementRef: number | null
  postedJournalEntryId: number | null
  validatedAt: string | null
  finalizedAt: string | null
}

export interface PosPaymentAttempt {
  id: number
  orderId: number | null
  orderNo: string
  storeCode: string
  localTxId: string
  provider: string
  mode: string
  txCode: string
  retryOfAttemptId?: number | null
  retryOfLocalTxId?: string
  bankId: string
  requestAmount: number
  approvedAmount: number
  responseCode: string
  approvalCode: string
  traceNo: string
  terminalId: string
  merchantId: string
  responseText: string
  status: string
  errorReason: string
  createdAt: string
}

export interface PosLinkposTenderRule {
  id: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority: number
  isActive: boolean
  createdAt: string
}

export async function getPosSettlement(params: {
  settleDate: string
  storeCode?: string
}) {
  const q = new URLSearchParams()
  q.set('settleDate', params.settleDate)
  if (params.storeCode) q.set('storeCode', params.storeCode)
  const res = await apiFetchWithOffline('/api/getPosSettlement?' + q.toString(), { cache: 'no-store' })
  return res.json() as Promise<{
    systemTotal: number
    systemSubtotal?: number
    systemVat?: number
    /** 완료 주문 `payment_cash` 합계 — 결산 현금 줄 자동 채움용 */
    systemCashFromOrders?: number
    systemCryptoFromOrders?: number
    /** 해당 결산일(trans_date)·매장 시재 거래 순액(입금+, 출금-/매출출금-) — 마감 예상 돈통용 */
    tillNetForSettleDate?: number
    /** 저장 결산 현금 vs 실시간 주문 현금 */
    cashReconcile?: {
      liveCash: number
      savedCash: number | null
      mismatch: boolean
      diff: number
      closed: boolean
    }
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
    }
    settlement: PosSettlement | PosSettlement[] | null
    closeRun?: PosCloseRun | null
  }>
}

/** 결산 현금을 완료 주문 합에 맞춤(마감이어도 결제 금액만, 시재 유지) */
export async function reconcilePosSettlementCash(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/reconcilePosSettlementCash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: string
      liveCash: number
      savedCashBefore: number | null
      savedCashAfter: number | null
    }
  }>
}

export async function getPosPaymentAttempts(params?: {
  startStr?: string
  endStr?: string
  storeCode?: string
  localTxId?: string
  orderId?: number
  status?: 'all' | 'approved' | 'declined' | 'failed'
  limit?: number
}) {
  const q = new URLSearchParams()
  if (params?.startStr) q.set('startStr', params.startStr)
  if (params?.endStr) q.set('endStr', params.endStr)
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.localTxId) q.set('localTxId', params.localTxId)
  if (params?.orderId != null && Number(params.orderId) > 0) q.set('orderId', String(Math.trunc(Number(params.orderId))))
  if (params?.status) q.set('status', params.status)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const res = await apiFetchWithOffline('/api/getPosPaymentAttempts?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosPaymentAttempt[]
}

export async function getPosLinkposTenderRules(params?: {
  storeCode?: string
  includeShared?: boolean
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.includeShared != null) q.set('includeShared', params.includeShared ? 'true' : 'false')
  const res = await apiFetchWithOffline('/api/getPosLinkposTenderRules?' + q.toString())
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data)) return []
  return data as PosLinkposTenderRule[]
}

export async function savePosLinkposTenderRule(params: {
  id?: number
  storeCode: string
  matchKeyword: string
  tenderGroup: 'card' | 'qr'
  tenderKey: string
  priority?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; id?: number; message?: string }>
}

export async function deletePosLinkposTenderRule(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosLinkposTenderRule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type PosChannelSettlementChannel = 'card' | 'grab' | 'lineman' | 'shopee' | 'delivery_all'

export interface PosChannelSettlementRow {
  id: number
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  fee: number
  net: number
  feeSource?: string | null
  memo?: string | null
  bankTransactionId?: number | null
  journalEntryId?: number | null
}

export async function getPosChannelSettlementGross(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  net?: number
}) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
    channel: params.channel,
  })
  if (params.net != null && Number(params.net) > 0) q.set('net', String(params.net))
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlementGross?${q}`)
  return res.json() as Promise<{
    success: boolean
    gross?: number
    orderCount?: number
    cardFeeTotal?: number
    coverDates?: string[]
    expanded?: boolean
    suggestedFee?: number | null
    suggestedFeeSource?: string | null
    platformFeePct?: number | null
    platformAppCode?: string | null
    message?: string
  }>
}

export async function getPosChannelSettlements(params: { storeCode: string; settleDate: string }) {
  const q = new URLSearchParams({
    storeCode: params.storeCode,
    settleDate: params.settleDate,
  })
  const res = await apiFetchWithOffline(`/api/getPosChannelSettlements?${q}`)
  return res.json() as Promise<{
    success: boolean
    settlements?: PosChannelSettlementRow[]
    message?: string
  }>
}

export async function savePosChannelSettlement(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  net: number
  fee?: number
  feeSource?: string
  memo?: string
  bankTransactionId?: number
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosChannelSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    settlementId?: number
    journalEntryId?: number | null
    alreadyPosted?: boolean
    message?: string
  }>
}

export async function importPosChannelSettlements(params: {
  rows: {
    storeCode: string
    settleDate: string
    channel: PosChannelSettlementChannel
    gross: number
    net: number
    fee?: number
    memo?: string
    feeSource?: string
  }[]
  repost?: boolean
}) {
  const res = await apiFetchWithOffline('/api/importPosChannelSettlements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    processed?: number
    failed?: number
    results?: { index: number; ok: boolean; code?: string; channel?: string; settleDate?: string }[]
    message?: string
  }>
}

export async function savePosSettlement(params: {
  storeCode?: string
  settleDate: string
  cashActual?: number | null
  cashActualDenoms?: Record<string, number> | null
  cashAmt?: number
  cardAmt?: number
  cardBreakdown?: Record<string, number>
  qrAmt?: number
  qrBreakdown?: Record<string, number>
  deliveryAppAmt?: number
  deliveryAppBreakdown?: Record<string, number>
  dineInDeliveryAmt?: number
  dineInDeliveryBreakdown?: Record<string, number>
  otherAmt?: number
  otherBreakdown?: Record<string, number>
  cryptoAmt?: number
  memo?: string
  closed?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosSettlement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      diffTotal: number
      hasSettlement: boolean
    }
  }>
}

export async function finalizePosClose(params: {
  storeCode: string
  settleDate: string
}) {
  const res = await apiFetchWithOffline('/api/posClose/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: params.storeCode,
      businessDate: params.settleDate,
      settleDate: params.settleDate,
    }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    result?: {
      status: 'validated' | 'draft'
      postedJournalEntryId: number | null
      finalized: boolean
    }
  }>
}
