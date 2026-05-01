import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, type JwtPayload } from '@/lib/jwt-auth'
import { isOfficeRole } from '@/lib/permissions'
import { normStoreKey } from '@/lib/store-list-keys'
import { toDateStrBangkok } from '@/lib/attendance-utils'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  coercePaymentOtherBreakdownForSave,
  paymentOtherBreakdownForDb,
} from '@/lib/pos-payment-other-breakdown'

const DELIVERY_PAYMENT_CHANNELS = new Set(['grab', 'lineman', 'shopee', 'dine_in'])

function normalizeDeliveryPaymentChannel(raw: unknown, paymentDeliveryApp: number): string | null {
  if (paymentDeliveryApp <= 0.005) return null
  const s = String(raw ?? '').trim().toLowerCase()
  if (DELIVERY_PAYMENT_CHANNELS.has(s)) return s
  return 'grab'
}

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

const CORRECTABLE = new Set(['paid', 'completed'])

/**
 * POS 영수증 관리: 당일(방콕) 완료·결제완료 주문의 결제 수단 분해만 정정 (합계 불변).
 * 분개 역처리는 하지 않음(회계는 별도 조정 또는 동일 총액 전제).
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
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
    const deliveryPaymentChannel = normalizeDeliveryPaymentChannel(
      body?.deliveryPaymentChannel ?? body?.delivery_payment_channel,
      paymentDeliveryApp
    )

    const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
      limit: 1,
      select:
        'id,store_code,total,status,created_at,memo,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,delivery_payment_channel',
    })) as {
      id?: number
      store_code?: string
      total?: number
      status?: string
      created_at?: string
      memo?: string
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
    const storeCode = String(row.store_code ?? '').trim()
    if (!callerMayAccessStore(storeCode, caller)) {
      return NextResponse.json({ success: false, message: 'forbidden_store' }, { status: 403, headers })
    }
    const st = String(row.status ?? '').toLowerCase()
    if (!CORRECTABLE.has(st)) {
      return NextResponse.json({ success: false, message: 'status_not_correctable' }, { status: 400, headers })
    }
    const createdDay = toDateStrBangkok(row.created_at ?? null)
    const todayBangkok = toDateStrBangkok(new Date())
    if (!createdDay || createdDay !== todayBangkok) {
      return NextResponse.json({ success: false, message: 'today_only' }, { status: 400, headers })
    }
    const total = Number(row.total ?? 0)
    const paymentSum = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
    if (total > 0.005 && Math.abs(paymentSum - total) > 0.02) {
      return NextResponse.json({ success: false, message: 'payment_total_mismatch' }, { status: 400, headers })
    }

    const who = [caller.name, caller.employeeCode].filter(Boolean).join(' ')
    const stamp = `[PAY_CORRECT ${new Date().toISOString()} ${who}] ${reason.slice(0, 240)}`
    const prevMemo = String(row.memo ?? '').trim()
    const nextMemo = prevMemo ? `${prevMemo}\n${stamp}` : stamp

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

    await supabaseUpdateByFilter(`pos_orders`, `id=eq.${id}`, {
      payment_cash: paymentCash,
      payment_card: paymentCard,
      payment_qr: paymentQr,
      payment_other: paymentOther,
      payment_other_breakdown: breakdownDb,
      payment_delivery_app: paymentDeliveryApp,
      delivery_payment_channel: deliveryPaymentChannel,
      memo: nextMemo,
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('correctPosOrderPayment:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg.slice(0, 500) },
      { status: 500, headers }
    )
  }
}
