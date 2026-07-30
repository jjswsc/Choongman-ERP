import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import { loadPosBusinessDayStartForServer } from '@/lib/pos-business-day-server'
import { isPosPaidLikeStatus } from '@/lib/pos-order-policy'
import { appendPosInternalMemoStamp } from '@/lib/pos-tax-invoice'
import {
  supabaseSelectFilterStrippingUnknownColumns,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'

export type SettlementPaymentAmts = {
  cashAmt: number
  cardAmt: number
  qrAmt: number
  otherAmt: number
  deliveryAppAmt: number
  dineInDeliveryAmt: number
}

export type PosSettlementPayCorrectSyncResult = {
  status: 'no_settlement' | 'already_matched' | 'synced'
  closed: boolean
  settleDate: string
  liveCash: number
  savedCashBefore: number | null
  savedCashAfter: number | null
  deltas?: SettlementPaymentAmts
}

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

function round2Signed(n: number): number {
  return Math.round(n * 100) / 100
}

/** 결산 breakdown에 결제수단 정정 delta 반영 */
export function applySettlementBreakdownDelta(
  breakdown: Record<string, unknown> | null | undefined,
  delta: number,
  fallbackKey: string
): Record<string, number> {
  const d = round2Signed(delta)
  const next: Record<string, number> = {}
  if (breakdown && typeof breakdown === 'object') {
    for (const [k, v] of Object.entries(breakdown)) {
      const n = Math.max(0, Number(v) || 0)
      if (n > 0.005) next[k] = round2(n)
    }
  }
  if (Math.abs(d) <= 0.005) return next

  if (d > 0) {
    const key = fallbackKey || 'Other'
    next[key] = round2((next[key] || 0) + d)
    return next
  }

  let left = -d
  const keys = Object.keys(next)
  for (const k of keys) {
    if (left <= 0.005) break
    const cur = next[k] || 0
    const take = Math.min(cur, left)
    const remain = round2(cur - take)
    if (remain <= 0.005) delete next[k]
    else next[k] = remain
    left = round2Signed(left - take)
  }
  return next
}

export type PayCorrectPaymentSnapshot = {
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentOther: number
  paymentDeliveryApp: number
  deliveryPaymentChannel?: string | null
  orderType?: string | null
}

function isDineInDelivery(snap: PayCorrectPaymentSnapshot): boolean {
  const channel = String(snap.deliveryPaymentChannel || '').trim().toLowerCase()
  const orderType = String(snap.orderType || '').trim().toLowerCase()
  return orderType === 'dine_in' || channel === 'dine_in'
}

export function computePayCorrectSettlementDeltas(
  before: PayCorrectPaymentSnapshot,
  after: PayCorrectPaymentSnapshot
): SettlementPaymentAmts {
  const beforeDel = Math.max(0, Number(before.paymentDeliveryApp) || 0)
  const afterDel = Math.max(0, Number(after.paymentDeliveryApp) || 0)
  const beforeDine = isDineInDelivery(before) ? beforeDel : 0
  const afterDine = isDineInDelivery(after) ? afterDel : 0
  const beforeApp = isDineInDelivery(before) ? 0 : beforeDel
  const afterApp = isDineInDelivery(after) ? 0 : afterDel

  return {
    cashAmt: round2Signed((Number(after.paymentCash) || 0) - (Number(before.paymentCash) || 0)),
    cardAmt: round2Signed((Number(after.paymentCard) || 0) - (Number(before.paymentCard) || 0)),
    qrAmt: round2Signed((Number(after.paymentQr) || 0) - (Number(before.paymentQr) || 0)),
    otherAmt: round2Signed((Number(after.paymentOther) || 0) - (Number(before.paymentOther) || 0)),
    deliveryAppAmt: round2Signed(afterApp - beforeApp),
    dineInDeliveryAmt: round2Signed(afterDine - beforeDine),
  }
}

export async function computeLiveSettlementCashAmt(
  storeCode: string,
  settleDateYmd: string
): Promise<number> {
  const store = String(storeCode || '').trim()
  const ymd = String(settleDateYmd || '').trim().slice(0, 10)
  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 0

  const bizStart = await loadPosBusinessDayStartForServer(store)
  const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(ymd, bizStart)
  const orderFilter =
    `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
    `&store_code=ilike.${encodeURIComponent(store)}`

  const orders = (await supabaseSelectFilterStrippingUnknownColumns(
    'pos_orders',
    orderFilter,
    {
      limit: 20000,
      select: 'status,payment_cash',
    },
    'syncPosSettlementCash'
  )) as { status?: string; payment_cash?: number }[] | null

  let cash = 0
  for (const o of orders || []) {
    if (!isPosPaidLikeStatus(String(o.status ?? ''))) continue
    cash += Number(o.payment_cash) || 0
  }
  return round2(cash)
}

/**
 * 결제수단 정정 후 POS 결산 금액(현금·카드 등)을 주문과 맞춤.
 * - 현금: 영업일 완료주문 payment_cash 합으로 재설정(POS 결산 화면과 동일)
 * - 카드/QR/기타/배달: 해당 주문 before→after delta 적용 (LINKPOS breakdown 과 충돌 최소화)
 * - 마감(closed)이어도 결제 금액 필드만 갱신(시재 cash_actual 은 유지)
 */
export async function syncPosSettlementAfterPayCorrect(params: {
  storeCode: string
  settleDateYmd: string
  who: string
  reason: string
  before: PayCorrectPaymentSnapshot
  after: PayCorrectPaymentSnapshot
}): Promise<PosSettlementPayCorrectSyncResult> {
  const store = String(params.storeCode || '').trim()
  const ymd = String(params.settleDateYmd || '').trim().slice(0, 10)
  const empty: PosSettlementPayCorrectSyncResult = {
    status: 'no_settlement',
    closed: false,
    settleDate: ymd,
    liveCash: 0,
    savedCashBefore: null,
    savedCashAfter: null,
  }
  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return empty

  const deltas = computePayCorrectSettlementDeltas(params.before, params.after)
  const liveCash = await computeLiveSettlementCashAmt(store, ymd)

  const rows = (await supabaseSelectFilterStrippingUnknownColumns(
    'pos_settlements',
    `store_code=eq.${encodeURIComponent(store)}&settle_date=eq.${encodeURIComponent(ymd)}`,
    {
      limit: 1,
      select:
        'id,store_code,settle_date,cash_amt,card_amt,qr_amt,other_amt,delivery_app_amt,dine_in_delivery_amt,card_breakdown,qr_breakdown,other_breakdown,delivery_app_breakdown,dine_in_delivery_breakdown,memo,closed',
    },
    'syncPosSettlementAfterPayCorrect'
  )) as {
    id?: number
    cash_amt?: number
    card_amt?: number
    qr_amt?: number
    other_amt?: number
    delivery_app_amt?: number
    dine_in_delivery_amt?: number
    card_breakdown?: Record<string, unknown> | null
    qr_breakdown?: Record<string, unknown> | null
    other_breakdown?: Record<string, unknown> | null
    delivery_app_breakdown?: Record<string, unknown> | null
    dine_in_delivery_breakdown?: Record<string, unknown> | null
    memo?: string | null
    closed?: boolean
  }[] | null

  const row = rows?.[0]
  if (!row?.id) {
    return { ...empty, liveCash, status: 'no_settlement' }
  }

  const savedCashBefore = round2(Number(row.cash_amt) || 0)
  const nextCash = liveCash
  const nextCard = round2(Math.max(0, (Number(row.card_amt) || 0) + deltas.cardAmt))
  const nextQr = round2(Math.max(0, (Number(row.qr_amt) || 0) + deltas.qrAmt))
  const nextOther = round2(Math.max(0, (Number(row.other_amt) || 0) + deltas.otherAmt))
  const nextDelivery = round2(Math.max(0, (Number(row.delivery_app_amt) || 0) + deltas.deliveryAppAmt))
  const nextDineIn = round2(
    Math.max(0, (Number(row.dine_in_delivery_amt) || 0) + deltas.dineInDeliveryAmt)
  )

  const cashChanged = Math.abs(nextCash - savedCashBefore) > 0.02
  const otherChanged =
    Math.abs(deltas.cardAmt) > 0.02 ||
    Math.abs(deltas.qrAmt) > 0.02 ||
    Math.abs(deltas.otherAmt) > 0.02 ||
    Math.abs(deltas.deliveryAppAmt) > 0.02 ||
    Math.abs(deltas.dineInDeliveryAmt) > 0.02

  if (!cashChanged && !otherChanged) {
    return {
      status: 'already_matched',
      closed: !!row.closed,
      settleDate: ymd,
      liveCash,
      savedCashBefore,
      savedCashAfter: savedCashBefore,
      deltas,
    }
  }

  const stamp = `[PAY_CORRECT_SETTLEMENT_SYNC ${new Date().toISOString()} ${params.who}] cash ${savedCashBefore}→${nextCash} | ${String(params.reason || '').slice(0, 120)}`
  const nextMemo = appendPosInternalMemoStamp(String(row.memo ?? ''), stamp)

  await supabaseUpdateByFilterWithPgrst204Fallback(
    'pos_settlements',
    `id=eq.${Number(row.id)}`,
    {
      cash_amt: nextCash,
      card_amt: nextCard,
      qr_amt: nextQr,
      other_amt: nextOther,
      delivery_app_amt: nextDelivery,
      dine_in_delivery_amt: nextDineIn,
      card_breakdown: applySettlementBreakdownDelta(row.card_breakdown, deltas.cardAmt, 'Other'),
      qr_breakdown: applySettlementBreakdownDelta(row.qr_breakdown, deltas.qrAmt, 'PromptPay'),
      other_breakdown: applySettlementBreakdownDelta(row.other_breakdown, deltas.otherAmt, 'Other'),
      delivery_app_breakdown: applySettlementBreakdownDelta(
        row.delivery_app_breakdown,
        deltas.deliveryAppAmt,
        'Other'
      ),
      dine_in_delivery_breakdown: applySettlementBreakdownDelta(
        row.dine_in_delivery_breakdown,
        deltas.dineInDeliveryAmt,
        'DineIn'
      ),
      memo: nextMemo,
      updated_at: new Date().toISOString(),
    },
    'syncPosSettlementAfterPayCorrect'
  )

  return {
    status: 'synced',
    closed: !!row.closed,
    settleDate: ymd,
    liveCash,
    savedCashBefore,
    savedCashAfter: nextCash,
    deltas,
  }
}

/**
 * 결산 현금만 실시간 주문 합에 맞춤(카드 등 breakdown 은 건드리지 않음).
 * POS 결산 조회 시 잔여 불일치 자동 치유 / 수동 재동기화에 사용.
 */
export async function reconcilePosSettlementCashAmtToLive(params: {
  storeCode: string
  settleDateYmd: string
  who?: string
}): Promise<PosSettlementPayCorrectSyncResult> {
  const store = String(params.storeCode || '').trim()
  const ymd = String(params.settleDateYmd || '').trim().slice(0, 10)
  const empty: PosSettlementPayCorrectSyncResult = {
    status: 'no_settlement',
    closed: false,
    settleDate: ymd,
    liveCash: 0,
    savedCashBefore: null,
    savedCashAfter: null,
  }
  if (!store || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return empty

  const liveCash = await computeLiveSettlementCashAmt(store, ymd)
  const rows = (await supabaseSelectFilterStrippingUnknownColumns(
    'pos_settlements',
    `store_code=eq.${encodeURIComponent(store)}&settle_date=eq.${encodeURIComponent(ymd)}`,
    { limit: 1, select: 'id,cash_amt,memo,closed' },
    'reconcilePosSettlementCashAmtToLive'
  )) as { id?: number; cash_amt?: number; memo?: string | null; closed?: boolean }[] | null

  const row = rows?.[0]
  if (!row?.id) return { ...empty, liveCash }

  const savedCashBefore = round2(Number(row.cash_amt) || 0)
  if (Math.abs(savedCashBefore - liveCash) <= 0.02) {
    return {
      status: 'already_matched',
      closed: !!row.closed,
      settleDate: ymd,
      liveCash,
      savedCashBefore,
      savedCashAfter: savedCashBefore,
    }
  }

  const who = String(params.who || 'system').trim() || 'system'
  const stamp = `[SETTLEMENT_CASH_RECONCILE ${new Date().toISOString()} ${who}] ${savedCashBefore}→${liveCash}`
  const nextMemo = appendPosInternalMemoStamp(String(row.memo ?? ''), stamp)

  await supabaseUpdateByFilterWithPgrst204Fallback(
    'pos_settlements',
    `id=eq.${Number(row.id)}`,
    {
      cash_amt: liveCash,
      memo: nextMemo,
      updated_at: new Date().toISOString(),
    },
    'reconcilePosSettlementCashAmtToLive'
  )

  return {
    status: 'synced',
    closed: !!row.closed,
    settleDate: ymd,
    liveCash,
    savedCashBefore,
    savedCashAfter: liveCash,
  }
}

/** getPosSettlement / ERP 안내용: 저장 현금 vs 실시간 현금 */
export function buildSettlementCashReconcile(params: {
  liveCash: number
  savedCash: number | null | undefined
  closed?: boolean
}): {
  liveCash: number
  savedCash: number | null
  mismatch: boolean
  diff: number
  closed: boolean
} {
  const liveCash = round2(Number(params.liveCash) || 0)
  const savedCash =
    params.savedCash == null || !Number.isFinite(Number(params.savedCash))
      ? null
      : round2(Number(params.savedCash))
  const diff = savedCash == null ? 0 : round2Signed(savedCash - liveCash)
  return {
    liveCash,
    savedCash,
    mismatch: savedCash != null && Math.abs(diff) > 0.02,
    diff,
    closed: !!params.closed,
  }
}
