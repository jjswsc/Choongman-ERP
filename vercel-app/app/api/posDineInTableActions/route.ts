import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { isDineInOrderTypeForGuestCount } from '@/lib/pos-sales-order-type-filter'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { loadPosBusinessDayStartForServer } from '@/lib/pos-business-day-server'
import { consolidatePosOrderLinesAfterMerge } from '@/lib/pos-dine-in-table-merge-rules'
import {
  appendPosOrderMergedAbsorbStamp,
  appendPosOrderMergedKeepStamp,
} from '@/lib/pos-order-merge'
import { posApiCorsHeaders } from '@/lib/pos-api-write-auth'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { requireAuth } from '@/lib/verify-auth'

type PosOrderRow = {
  id?: number
  order_no?: string
  store_code?: string
  order_type?: string
  table_name?: string
  status?: string
  created_at?: string
  items_json?: string
  memo?: string
  discount_amt?: number
  discount_reason?: string
  guest_count?: number
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
  delivery_payment_channel?: string | null
  member_id?: number | null
  member_no?: string | null
  coupon_code?: string | null
  coupon_discount_amt?: number
  point_used?: number
  point_earned?: number
}

function isClosedStatus(status: string): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'cancelled' || s === 'refunded' || s === 'completed'
}

function paymentSum(r: PosOrderRow): number {
  return (
    Math.max(0, Number(r.payment_cash) || 0) +
    Math.max(0, Number(r.payment_card) || 0) +
    Math.max(0, Number(r.payment_qr) || 0) +
    Math.max(0, Number(r.payment_other) || 0) +
    Math.max(0, Number(r.payment_delivery_app) || 0)
  )
}

function parseItems(json: string | undefined): Record<string, unknown>[] {
  try {
    const arr = JSON.parse(json || '[]')
    return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function normalizeItem(raw: Record<string, unknown>, forcedId: string): Record<string, unknown> {
  const qty = Math.max(0.01, Number(raw.qty ?? raw.quantity ?? 1) || 1)
  const price = Number(raw.price ?? 0) || 0
  const name = String(raw.name ?? '')
  const note = String(raw.note ?? '').trim()
  const out: Record<string, unknown> = {
    id: forcedId,
    name,
    price,
    qty,
  }
  if (note) out.note = note
  if (raw.orderType != null) out.orderType = raw.orderType
  if (raw.deliveryAppCode != null) out.deliveryAppCode = raw.deliveryAppCode
  if (raw.promoId != null) out.promoId = raw.promoId
  if (raw.promoCode != null) out.promoCode = raw.promoCode
  if (raw.promoItems != null) out.promoItems = raw.promoItems
  if (raw.servedAt != null) out.servedAt = raw.servedAt
  if (raw.servedBy != null) out.servedBy = raw.servedBy
  return out
}

async function fetchOrder(id: number): Promise<PosOrderRow | null> {
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
    limit: 1,
  })) as PosOrderRow[] | null
  return rows?.[0] ?? null
}

async function hasOtherActiveOrderOnTable(
  storeCode: string,
  tableName: string,
  excludeOrderId: number
): Promise<boolean> {
  const name = String(tableName ?? '').trim()
  if (!name) return false
  const rows = (await supabaseSelectFilter(
    'pos_orders',
    `store_code=ilike.${encodeURIComponent(storeCode)}&table_name=eq.${encodeURIComponent(name)}`,
    { limit: 50 }
  )) as PosOrderRow[] | null
  if (!rows?.length) return false
  const bizStart = await loadPosBusinessDayStartForServer(storeCode)
  const currentBusinessDate = getPosBusinessDateStrFromConfig(new Date(), bizStart)
  return rows.some((r) => {
    const rid = Number(r.id)
    if (!rid || rid === excludeOrderId) return false
    // 테이블 이동/합석은 홀 주문 기준으로 동작하므로, 비표준/배달/포장 주문은 점유 판정에서 제외한다.
    if (normalizePosOrderTypeKey(r.order_type) !== 'dine_in') return false
    // POS 테이블 화면과 동일하게 "현재 방콕 영업일" 주문만 점유로 본다.
    const createdAtRaw = String(r.created_at ?? '').trim()
    if (createdAtRaw) {
      const createdAt = new Date(createdAtRaw)
      if (!Number.isNaN(createdAt.getTime())) {
        const rowBusinessDate = getPosBusinessDateStrFromConfig(createdAt, bizStart)
        if (rowBusinessDate !== currentBusinessDate) return false
      }
    }
    return !isClosedStatus(String(r.status ?? ''))
  })
}

/**
 * 홀(dine_in) 테이블 이동·합석 — 상세 규칙은 `lib/pos-dine-in-table-merge-rules.ts` 주석 참고.
 * - move: 같은 주문의 table_name만 변경 (빈 테이블로만)
 * - merge: keep 주문에 absorb 주문 품목·인원·할인 등을 합친 뒤 absorb는 cancelled
 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  const isOfflineQueueSync = req.headers.get('X-CM-Offline-Queue-Sync') === '1'

  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth!

    const body = await req.json()
    const action = String(body?.action ?? '').toLowerCase()

    if (action === 'move') {
      const orderId = Number(body?.orderId)
      const targetTableName = String(body?.targetTableName ?? '').trim()
      if (!orderId || !targetTableName) {
        return NextResponse.json(
          { success: false, message: 'orderId and targetTableName required' },
          { headers }
        )
      }

      const row = await fetchOrder(orderId)
      if (!row?.id) {
        return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
      }
      if (!(await authCanAccessPosStoreWrite(auth, String(row.store_code ?? '')))) {
        return NextResponse.json(
          { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
      if (coercePosOrderTypeForDb(row.order_type) !== 'dine_in') {
        return NextResponse.json({ success: false, message: '매장(홀) 주문만 이동할 수 있습니다.' }, { headers })
      }
      if (isClosedStatus(String(row.status ?? ''))) {
        if (isOfflineQueueSync && String(row.table_name ?? '').trim() === targetTableName) {
          return NextResponse.json({ success: true }, { headers })
        }
        return NextResponse.json({ success: false, message: '완료·취소된 주문은 이동할 수 없습니다.' }, { headers })
      }

      const store = String(row.store_code ?? '').trim()
      const currentName = String(row.table_name ?? '').trim()
      if (currentName === targetTableName) {
        return NextResponse.json({ success: true }, { headers })
      }

      const busy = await hasOtherActiveOrderOnTable(store, targetTableName, orderId)
      if (busy) {
        return NextResponse.json(
          {
            success: false,
            message:
              '이미 주문이 있는 테이블입니다. 빈 테이블로 이동하거나 합석 기능을 사용해 주세요.',
          },
          { headers }
        )
      }

      await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
        table_name: targetTableName,
      })
      try {
        const { syncQrSessionTableNameForOrder } = await import('@/lib/qr-table-server')
        await syncQrSessionTableNameForOrder({ orderId, targetTableName })
      } catch (qrSyncErr) {
        console.error('posDineInTableActions move qr session sync:', qrSyncErr)
      }
      return NextResponse.json({ success: true }, { headers })
    }

    if (action === 'merge') {
      const keepOrderId = Number(body?.keepOrderId)
      const absorbOrderId = Number(body?.absorbOrderId)
      if (!keepOrderId || !absorbOrderId || keepOrderId === absorbOrderId) {
        return NextResponse.json(
          { success: false, message: 'keepOrderId and absorbOrderId required (must differ)' },
          { headers }
        )
      }

      const keep = await fetchOrder(keepOrderId)
      const absorb = await fetchOrder(absorbOrderId)
      if (!keep?.id || !absorb?.id) {
        return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
      }
      const mergeStore = String(keep.store_code ?? '').trim()
      if (!(await authCanAccessPosStoreWrite(auth, mergeStore))) {
        return NextResponse.json(
          { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
          { status: 403, headers }
        )
      }

      const keepType = coercePosOrderTypeForDb(keep.order_type)
      const absorbType = coercePosOrderTypeForDb(absorb.order_type)
      if (keepType !== 'dine_in') {
        return NextResponse.json(
          { success: false, message: '합석 기준은 매장(홀) 테이블 주문만 가능합니다.' },
          { headers }
        )
      }
      if (absorbType !== 'dine_in' && absorbType !== 'takeout') {
        return NextResponse.json(
          { success: false, message: '합석할 수 있는 유형은 매장(홀) 또는 포장(takeout) 주문입니다.' },
          { headers }
        )
      }

      if (isClosedStatus(String(keep.status ?? '')) || isClosedStatus(String(absorb.status ?? ''))) {
        if (isOfflineQueueSync && String(absorb.status ?? '').toLowerCase() === 'cancelled') {
          return NextResponse.json({ success: true }, { headers })
        }
        return NextResponse.json(
          { success: false, message: '완료·취소된 주문은 합석할 수 없습니다.' },
          { headers }
        )
      }

      if (paymentSum(keep) > 0 || paymentSum(absorb) > 0) {
        return NextResponse.json(
          {
            success: false,
            message: '결제 금액이 반영된 주문은 합석할 수 없습니다. 이동만 가능합니다.',
          },
          { headers }
        )
      }

      const storeKeep = String(keep.store_code ?? '').trim()
      const storeAbs = String(absorb.store_code ?? '').trim()
      if (!storeKeep || storeKeep.toLowerCase() !== storeAbs.toLowerCase()) {
        return NextResponse.json(
          { success: false, message: '같은 매장 주문만 합석할 수 있습니다.' },
          { headers }
        )
      }

      const keepItemsRaw = parseItems(keep.items_json)
      const absorbItemsRaw = parseItems(absorb.items_json)
      if (!keepItemsRaw.length || !absorbItemsRaw.length) {
        return NextResponse.json({ success: false, message: '합석할 품목이 없습니다.' }, { headers })
      }

      const keepItems = keepItemsRaw.map((raw, i) =>
        normalizeItem(raw, String(raw.id ?? '').trim() || `k${keepOrderId}-${i}`)
      )
      const absorbItems = absorbItemsRaw.map((raw, i) =>
        normalizeItem(
          raw,
          `m${absorbOrderId}-${String(raw.id ?? '').trim() || String(i)}`
        )
      )
      const mergedItems = consolidatePosOrderLinesAfterMerge([...keepItems, ...absorbItems])

      let subtotal = 0
      for (const it of mergedItems) {
        const price = Number(it.price ?? 0) || 0
        const qty = Number(it.qty ?? 1) || 1
        subtotal += price * qty
      }

      const discountAmt =
        Math.max(0, Number(keep.discount_amt) || 0) + Math.max(0, Number(absorb.discount_amt) || 0)
      const couponDiscountAmt =
        Math.max(0, Number(keep.coupon_discount_amt) || 0) +
        Math.max(0, Number(absorb.coupon_discount_amt) || 0)
      const discountReason = [String(keep.discount_reason ?? '').trim(), String(absorb.discount_reason ?? '').trim()]
        .filter(Boolean)
        .join(' · ')
      const paymentCard =
        Math.max(0, Number(keep.payment_card) || 0) + Math.max(0, Number(absorb.payment_card) || 0)

      const pricing = computePosPricing({
        subtotal,
        discountAmt,
        deliveryFee: 0,
        packagingFee: 0,
        cardPaymentAmount: paymentCard,
        adjustments: {},
      })

      let guestCount = Math.max(0, Math.trunc(Number(keep.guest_count) || 0))
      if (isDineInOrderTypeForGuestCount(keep.order_type)) {
        guestCount += Math.max(0, Math.trunc(Number(absorb.guest_count) || 0))
        guestCount = Math.min(99, guestCount)
      }

      const memK = Math.max(0, Number(keep.member_id) || 0)
      const memA = Math.max(0, Number(absorb.member_id) || 0)
      const memberId = memK || memA
      const memberNo = String(keep.member_no ?? '').trim() || String(absorb.member_no ?? '').trim()

      let couponCode = String(keep.coupon_code ?? '').trim().toUpperCase()
      const absorbCoupon = String(absorb.coupon_code ?? '').trim().toUpperCase()
      let memo = [String(keep.memo ?? '').trim(), String(absorb.memo ?? '').trim()].filter(Boolean).join('\n')
      if (absorbCoupon && absorbCoupon !== couponCode) {
        memo = memo
          ? `${memo}\n[합석] 보조 쿠폰: ${absorbCoupon}`
          : `[합석] 보조 쿠폰: ${absorbCoupon}`
      }
      if (!couponCode && absorbCoupon) couponCode = absorbCoupon
      // Realtime 추가주문 오인 방지(주방 재인쇄 금지) — absorb 취소 스탬프와 쌍
      memo = appendPosOrderMergedKeepStamp(memo, { absorbOrderId })

      const pointUsed =
        Math.max(0, Math.trunc(Number(keep.point_used) || 0)) +
        Math.max(0, Math.trunc(Number(absorb.point_used) || 0))

      const patch: Record<string, unknown> = {
        items_json: JSON.stringify(mergedItems),
        subtotal,
        vat: pricing.vatFeeAmt,
        total: pricing.finalTotal,
        discount_amt: discountAmt,
        discount_reason: discountReason,
        coupon_code: couponCode || null,
        coupon_discount_amt: couponDiscountAmt,
        payment_cash:
          Math.max(0, Number(keep.payment_cash) || 0) + Math.max(0, Number(absorb.payment_cash) || 0),
        payment_card: paymentCard,
        payment_qr:
          Math.max(0, Number(keep.payment_qr) || 0) + Math.max(0, Number(absorb.payment_qr) || 0),
        payment_other:
          Math.max(0, Number(keep.payment_other) || 0) + Math.max(0, Number(absorb.payment_other) || 0),
        payment_other_breakdown: null,
        payment_delivery_app:
          Math.max(0, Number(keep.payment_delivery_app) || 0) +
          Math.max(0, Number(absorb.payment_delivery_app) || 0),
        delivery_payment_channel: (() => {
          const pk = Math.max(0, Number(keep.payment_delivery_app) || 0)
          const pa = Math.max(0, Number(absorb.payment_delivery_app) || 0)
          const sum = pk + pa
          if (sum <= 0) return null
          const ck = String(keep.delivery_payment_channel ?? '').trim().toLowerCase()
          const ca = String(absorb.delivery_payment_channel ?? '').trim().toLowerCase()
          if (pk > 0 && ck) return ck
          if (pa > 0 && ca) return ca
          return ck || ca || null
        })(),
        member_id: memberId || null,
        member_no: memberNo || null,
        point_used: pointUsed,
        memo,
        guest_count: guestCount,
      }

      await supabaseUpdateByFilterWithPgrst204Fallback(
        'pos_orders',
        `id=eq.${keepOrderId}`,
        patch,
        'posDineInTableActions'
      )
      await supabaseUpdateByFilter('pos_orders', `id=eq.${absorbOrderId}`, {
        status: 'cancelled',
        memo: appendPosOrderMergedAbsorbStamp(absorb.memo, {
          keepOrderId,
          keepOrderNo: String(keep.order_no ?? ''),
        }),
      })

      try {
        const { closeQrSessionsForAbsorbedOrder } = await import('@/lib/qr-table-server')
        await closeQrSessionsForAbsorbedOrder(absorbOrderId)
      } catch (qrMergeErr) {
        console.error('posDineInTableActions merge qr session close:', qrMergeErr)
      }

      return NextResponse.json({ success: true }, { headers })
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { headers })
  } catch (e) {
    console.error('posDineInTableActions:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
