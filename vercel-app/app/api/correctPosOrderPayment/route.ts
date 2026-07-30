import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type JwtPayload } from '@/lib/jwt-auth'
import { verifyBearerWithSaasGate } from '@/lib/saas/bearer-saas-gate'
import { isOfficeRole } from '@/lib/permissions'
import { normStoreKey } from '@/lib/store-list-keys'
import {
  addDaysYmd,
  getPosBusinessDateStrFromConfig,
} from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import {
  supabaseSelectFilterStrippingUnknownColumns,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'
import { computePayCorrectAmountPatch } from '@/lib/pos-pay-correct-amounts'
import { appendPosInternalMemoStamp } from '@/lib/pos-tax-invoice'
import { resolveDeliveryPaymentChannelForSave } from '@/lib/pos-delivery-platform'
import { syncPosSettlementAfterPayCorrect } from '@/lib/pos-settlement-sync-after-pay-correct'

async function resolveBearerCaller(request: NextRequest): Promise<JwtPayload | null> {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m?.[1]) return null
  return verifyToken(m[1].trim())
}

function callerMayAccessStore(orderStore: string, caller: JwtPayload): boolean {
  if (isOfficeRole(caller.role)) return true
  const orderKey = normStoreKey(orderStore.replace(/^cm\s+/i, ''))
  const orderKeyFull = normStoreKey(orderStore)
  const pool = [caller.store, ...(caller.allowedStores || [])]
  for (const raw of pool) {
    const v = String(raw || '').trim()
    if (!v) continue
    const k = normStoreKey(v.replace(/^cm\s+/i, ''))
    const kf = normStoreKey(v)
    if (k && (k === orderKey || kf === orderKeyFull)) return true
  }
  return false
}

/** 배달뿐 아니라 홀(준비완료·조리중 등)도 동일 규칙으로 당일 정정 */
const CORRECTABLE = new Set(['paid', 'completed', 'ready', 'cooking', 'preparing'])

function round2(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100
}

/**
 * POS 영수증 관리: 당일(방콕) 결제가 반영된 주문(완료·결제완료·준비완료·조리중 등)의 결제 수단 분해 정정.
 * 기본은 합계 유지; `total`을 주면 메뉴 소계는 유지하고 할인·VAT만 새 합계에 맞게 재계산한다.
 * (구버전 비율 스케일은 total 1→230 처럼 할인액이 폭증하는 버그가 있어 제거)
 * 분개 역처리는 하지 않음(회계는 별도 조정 또는 동일 총액 전제).
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const saasBlocked = await verifyBearerWithSaasGate(req, '/api/correctPosOrderPayment')
  if (saasBlocked.blocked) {
    saasBlocked.blocked.headers.set('Access-Control-Allow-Origin', '*')
    return saasBlocked.blocked
  }
  try {
    const caller = await resolveBearerCaller(req)
    if (!caller) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401, headers })
    }
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400, headers })
    }
    const id = Number(body?.id)
    const reason = String(body?.reason ?? '').trim()
    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400, headers })
    }
    if (reason.length < 2) {
      return NextResponse.json({ success: false, message: 'reason_required' }, { status: 400, headers })
    }
    const paymentCash = Math.max(0, Number(body?.paymentCash ?? 0))
    const paymentCard = Math.max(0, Number(body?.paymentCard ?? 0))
    const paymentQr = Math.max(0, Number(body?.paymentQr ?? 0))
    const paymentOther = Math.max(0, Number(body?.paymentOther ?? 0))
    const paymentDeliveryApp = Math.max(0, Number(body?.paymentDeliveryApp ?? 0))

    const rows = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      `id=eq.${id}`,
      {
        limit: 1,
        select:
          'id,store_code,total,subtotal,vat,status,created_at,memo,table_name,order_no,order_type,delivery_app_code,discount_amt,coupon_discount_amt,collab_discount_amt,tier_discount_amt,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,delivery_payment_channel',
      },
      'correctPosOrderPayment'
    )) as {
      id?: number
      store_code?: string
      total?: number
      subtotal?: number
      vat?: number
      status?: string
      created_at?: string
      memo?: string
      table_name?: string
      order_no?: string
      order_type?: string | null
      delivery_app_code?: string | null
      discount_amt?: number
      coupon_discount_amt?: number
      collab_discount_amt?: number
      tier_discount_amt?: number
      delivery_fee?: number
      packaging_fee?: number
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_delivery_app?: number
      delivery_payment_channel?: string | null
      payment_other_breakdown?: unknown
    }[] | null

    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const deliveryPaymentChannel = resolveDeliveryPaymentChannelForSave({
      deliveryAppCode: row.delivery_app_code,
      deliveryPaymentChannel:
        String(body?.deliveryPaymentChannel ?? body?.delivery_payment_channel ?? '').trim() || undefined,
      tableName: row.table_name,
      memo: row.memo,
      orderNo: row.order_no,
      paymentDeliveryApp,
    })
    const storeCode = String(row.store_code ?? '').trim()
    if (!callerMayAccessStore(storeCode, caller)) {
      return NextResponse.json({ success: false, message: 'forbidden_store' }, { status: 403, headers })
    }
    const st = String(row.status ?? '').toLowerCase()
    if (!CORRECTABLE.has(st)) {
      return NextResponse.json({ success: false, message: 'status_not_correctable' }, { status: 400, headers })
    }
    /**
     * 정정 가능 시점: 매장 영업일(operating day) 기준으로 오늘 또는 어제까지.
     * - 영업시간 11:00→익일 02:00 같은 야간 영업이면 자정 이후 주문도 같은 영업일로 묶이고,
     *   다음 날 오전(영업 시작 전)에 정정해도 어제 영업일로 인정한다.
     */
    const businessHours = await loadPosBusinessHoursForServer(storeCode)
    const createdAt = row.created_at ? new Date(row.created_at) : null
    const createdBd =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? getPosBusinessDateStrFromConfig(createdAt, businessHours)
        : ''
    const todayBd = getPosBusinessDateStrFromConfig(new Date(), businessHours)
    const yesterdayBd = todayBd ? addDaysYmd(todayBd, -1) : ''
    if (!createdBd || (createdBd !== todayBd && createdBd !== yesterdayBd)) {
      return NextResponse.json({ success: false, message: 'today_only' }, { status: 400, headers })
    }
    const prevTotal = Number(row.total ?? 0)
    const bodyHasTotal =
      Object.prototype.hasOwnProperty.call(body, 'total') || Object.prototype.hasOwnProperty.call(body, 'orderTotal')
    const requestedTotalRaw = bodyHasTotal ? Number(body?.total ?? body?.orderTotal ?? NaN) : NaN
    const effectiveTotal = bodyHasTotal && Number.isFinite(requestedTotalRaw) ? round2(requestedTotalRaw) : prevTotal

    if (effectiveTotal <= 0.005) {
      return NextResponse.json({ success: false, message: 'total_invalid' }, { status: 400, headers })
    }

    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
    if (Math.abs(paymentSum - effectiveTotal) > 0.02) {
      return NextResponse.json({ success: false, message: 'payment_total_mismatch' }, { status: 400, headers })
    }

    const totalDelta = Math.abs(effectiveTotal - prevTotal) > 0.02
    const amountPatch = totalDelta
      ? computePayCorrectAmountPatch({
          prevTotal,
          effectiveTotal,
          subtotal: Number(row.subtotal ?? 0),
          discountAmt: Number(row.discount_amt ?? 0),
          couponDiscountAmt: Number(row.coupon_discount_amt ?? 0),
          deliveryFee: Number(row.delivery_fee ?? 0),
          packagingFee: Number(row.packaging_fee ?? 0),
          vat: Number(row.vat ?? 0),
          collabDiscountAmt: Number(row.collab_discount_amt ?? 0),
          tierDiscountAmt: Number(row.tier_discount_amt ?? 0),
        })
      : null

    if (totalDelta && !amountPatch) {
      return NextResponse.json({ success: false, message: 'total_fix_requires_positive_prev' }, { status: 400, headers })
    }

    const who = [caller.name, caller.employeeCode].filter(Boolean).join(' ')
    const reasonLine =
      totalDelta && prevTotal > 0.005
        ? `${reason.slice(0, 180)} | total ${round2(prevTotal)}→${effectiveTotal}`
        : reason.slice(0, 240)
    const stamp = `[PAY_CORRECT ${new Date().toISOString()} ${who}] ${reasonLine}`
    const nextMemo = appendPosInternalMemoStamp(String(row.memo ?? ''), stamp)

    const breakdownExplicit =
      Object.prototype.hasOwnProperty.call(body, 'paymentOtherBreakdown') ||
      Object.prototype.hasOwnProperty.call(body, 'payment_other_breakdown')
    const rawBr = body.paymentOtherBreakdown ?? body.payment_other_breakdown

    let breakdownDb: Record<string, unknown> | null = null
    if (paymentOther <= 0.005) {
      breakdownDb = null
    } else if (breakdownExplicit) {
      const emptyObj = typeof rawBr === 'object' && rawBr !== null && !Array.isArray(rawBr) && Object.keys(rawBr).length === 0
      if (rawBr == null || emptyObj) {
        breakdownDb = null
      } else {
        const coerced = coercePaymentOtherBreakdownForSave(paymentOther, rawBr)
        if (!coerced) {
          return NextResponse.json(
            { success: false, message: 'payment_other_breakdown_mismatch' },
            { status: 400, headers }
          )
        }
        breakdownDb = paymentOtherBreakdownForDb(coerced)
      }
    } else {
      breakdownDb = paymentOtherBreakdownForDb(
        coercePaymentOtherBreakdownForSave(paymentOther, row.payment_other_breakdown)
      )
    }

    const beforePay = {
      paymentCash: Number(row.payment_cash) || 0,
      paymentCard: Number(row.payment_card) || 0,
      paymentQr: Number(row.payment_qr) || 0,
      paymentOther: Number(row.payment_other) || 0,
      paymentDeliveryApp: Number(row.payment_delivery_app) || 0,
      deliveryPaymentChannel: row.delivery_payment_channel,
      orderType: row.order_type,
    }
    const afterPay = {
      paymentCash,
      paymentCard,
      paymentQr,
      paymentOther,
      paymentDeliveryApp,
      deliveryPaymentChannel,
      orderType: row.order_type,
    }

    await supabaseUpdateByFilterWithPgrst204Fallback(
      'pos_orders',
      `id=eq.${id}`,
      {
        ...(amountPatch
          ? {
              total: effectiveTotal,
              subtotal: amountPatch.subtotal,
              vat: amountPatch.vat,
              discount_amt: amountPatch.discountAmt,
              coupon_discount_amt: amountPatch.couponDiscountAmt,
              collab_discount_amt: amountPatch.collabDiscountAmt,
              tier_discount_amt: amountPatch.tierDiscountAmt,
              delivery_fee: amountPatch.deliveryFee,
              packaging_fee: amountPatch.packagingFee,
            }
          : {}),
        payment_cash: paymentCash,
        payment_card: paymentCard,
        payment_qr: paymentQr,
        payment_other: paymentOther,
        payment_other_breakdown: breakdownDb,
        payment_delivery_app: paymentDeliveryApp,
        delivery_payment_channel: deliveryPaymentChannel,
        memo: nextMemo,
      },
      'correctPosOrderPayment'
    )

    let settlementSync: Awaited<ReturnType<typeof syncPosSettlementAfterPayCorrect>> | null = null
    let settlementSyncError: string | null = null
    try {
      settlementSync = await syncPosSettlementAfterPayCorrect({
        storeCode,
        settleDateYmd: createdBd,
        who,
        reason,
        before: beforePay,
        after: afterPay,
      })
    } catch (syncErr) {
      console.error('correctPosOrderPayment settlement sync:', syncErr)
      settlementSyncError =
        syncErr instanceof Error ? syncErr.message.slice(0, 300) : String(syncErr).slice(0, 300)
    }

    return NextResponse.json(
      {
        success: true,
        settlementSync: settlementSync
          ? {
              status: settlementSync.status,
              closed: settlementSync.closed,
              settleDate: settlementSync.settleDate,
              liveCash: settlementSync.liveCash,
              savedCashBefore: settlementSync.savedCashBefore,
              savedCashAfter: settlementSync.savedCashAfter,
            }
          : null,
        settlementSyncError,
      },
      { headers }
    )
  } catch (e) {
    console.error('correctPosOrderPayment:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg.slice(0, 500) },
      { status: 500, headers }
    )
  }
}
