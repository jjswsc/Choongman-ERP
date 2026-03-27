/**
 * ShopeeFood 주문 페이로드 → pos_orders 적재 (배달)
 */

import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { logShopeeFoodEvent } from '@/lib/shopeefood-webhook'

function generateOrderNo(storeCode: string): string {
  const now = new Date()
  const store = (storeCode || 'ST').slice(0, 2).toUpperCase()
  const mmdd = now
    .toLocaleDateString('en-CA', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok' })
    .replace(/\D/g, '')
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${store}${mmdd}${rnd}`
}

/** ShopeeFood store_id → POS store_code. JSON: {"20278000":"ST01"} */
export function parseShopeeFoodStoreMap(): Record<string, string> {
  const raw = process.env.SHOPEEFOOD_STORE_MAP_JSON?.trim()
  if (!raw) return {}
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) {
      const key = String(k).trim()
      const val = String(v ?? '').trim()
      if (key && val) out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

function minorToMajor(amount: unknown, currency: string): number {
  const n = Math.max(0, Number(amount ?? 0) || 0)
  const c = String(currency || 'THB').toUpperCase()
  const div = c === 'IDR' ? 1 : 100
  return Math.round((n / div) * 100) / 100
}

function num(v: unknown): number {
  if (typeof v === 'string') return Number(v) || 0
  return Number(v) || 0
}

type PosItem = {
  id: string
  name: string
  price: number
  qty: number
  note?: string
  deliveryAppCode?: string
}

function optionParts(groups: unknown): { label: string; minorSum: number } {
  if (!Array.isArray(groups)) return { label: '', minorSum: 0 }
  const parts: string[] = []
  let minorSum = 0
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue
    const go = g as Record<string, unknown>
    const gname = String(go.name ?? '')
    const opts = Array.isArray(go.options) ? go.options : []
    for (const opt of opts) {
      if (!opt || typeof opt !== 'object') continue
      const oo = opt as Record<string, unknown>
      const on = String(oo.name ?? '')
      minorSum += num(oo.price)
      if (gname && on) parts.push(`${gname}:${on}`)
      else if (on) parts.push(on)
    }
  }
  return { label: parts.join(', '), minorSum }
}

/** 풀 페이로드·라이트 페이로드 모두 최대한 수용 */
function buildLineItems(order: Record<string, unknown>, currency: string): PosItem[] {
  const items = Array.isArray(order.items) ? order.items : []
  const out: PosItem[] = []
  let idx = 0
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, unknown>
    const qty = Math.max(1, num(it.quantity))
    const detail = it.detail && typeof it.detail === 'object' ? (it.detail as Record<string, unknown>) : {}
    const dish = detail.dish && typeof detail.dish === 'object' ? (detail.dish as Record<string, unknown>) : {}
    const dishName = String(dish.name ?? 'ShopeeFood')
    const extId = String(dish.external_id ?? dish.id ?? idx)
    const og = optionParts(detail.option_groups)
    const lightFinal = dish.merchant_final_price != null ? num(dish.merchant_final_price) : null
    const unitList = num(dish.unit_list_price ?? dish.uint_list_price)
    const unitPriceField = num(dish.unit_price)
    const lineSubMinor = num(it.subtotal)

    let unitMinor: number
    if (lightFinal != null) {
      unitMinor = lightFinal + og.minorSum
    } else if (lineSubMinor > 0 && qty > 0) {
      unitMinor = lineSubMinor / qty
    } else {
      unitMinor = (unitPriceField || unitList || 0) + og.minorSum
    }

    const unitMajor = minorToMajor(unitMinor, currency)
    const note = [String(it.remark ?? '').trim(), og.label].filter(Boolean).join(' · ') || undefined
    const itemId = String(it.item_id ?? `${extId}-${idx}`)
    out.push({
      id: `sf:${itemId}`,
      name: dishName,
      price: unitMajor,
      qty,
      note,
      deliveryAppCode: 'shopee',
    })
    idx += 1
  }
  return out
}

function buildMemoDedupe(orderId: string): string {
  return `sf_order:${orderId}`
}

export async function persistShopeeFoodOrderToPos(params: {
  order: Record<string, unknown>
  indicator: string
  reqPath: string
}): Promise<{ ok: true; orderNo: string; orderId: number } | { ok: false; message: string }> {
  const order = params.order
  const shopeeOrderId = String(order.id ?? '').trim()
  const shopeeStoreId = String(order.store_id ?? '').trim()
  const currency = String(order.currency ?? 'THB')
  const shortCode = String(order.order_short_code ?? '').trim()

  if (!shopeeOrderId || !shopeeStoreId) {
    return { ok: false, message: 'missing id or store_id' }
  }

  const map = parseShopeeFoodStoreMap()
  const storeCode = map[shopeeStoreId]
  if (!storeCode) {
    logShopeeFoodEvent('order_persist', params.indicator, {
      error: 'unknown_shopee_store',
      shopeeStoreId,
      path: params.reqPath,
    })
    return {
      ok: false,
      message: `unknown ShopeeFood store_id (set SHOPEEFOOD_STORE_MAP_JSON): ${shopeeStoreId}`,
    }
  }

  const memo = buildMemoDedupe(shopeeOrderId)
  const existing = (await supabaseSelectFilter(
    'pos_orders',
    `store_code=eq.${encodeURIComponent(storeCode)}&memo=eq.${encodeURIComponent(memo)}`,
    { limit: 1, select: 'id,order_no' }
  )) as { id?: number; order_no?: string }[]

  if (Array.isArray(existing) && existing[0]?.id) {
    logShopeeFoodEvent('order_persist', params.indicator, {
      duplicate: true,
      shopeeOrderId,
      posOrderId: existing[0].id,
      path: params.reqPath,
    })
    return { ok: true, orderNo: String(existing[0].order_no ?? ''), orderId: Number(existing[0].id) }
  }

  const items = buildLineItems(order, currency)
  if (items.length === 0) {
    return { ok: false, message: 'no line items' }
  }

  let subtotal = 0
  for (const it of items) {
    subtotal += it.price * it.qty
  }

  const amount = order.amount && typeof order.amount === 'object' ? (order.amount as Record<string, unknown>) : {}
  const shippingMinor = num(amount.shipping_fee)
  const merchSurchargeMinor = num(amount.merchant_surcharge_fee)
  const deliveryFee = minorToMajor(shippingMinor, currency)
  const packagingFee = minorToMajor(merchSurchargeMinor, currency)

  const paymentMethod = String(order.payment_method ?? '').toUpperCase()
  const totalMinor = num(amount.total_amount)
  const totalMajor = minorToMajor(totalMinor, currency)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: 0,
    deliveryFee,
    packagingFee,
    cardPaymentAmount: paymentMethod === 'ONLINE_PAYMENT' ? totalMajor : 0,
    adjustments: {},
  })

  const orderNo = generateOrderNo(storeCode)
  const remark = String(order.remark ?? '').trim()
  const tableName = shortCode
    ? remark
      ? `ShopeeFood #${shortCode} · ${remark.slice(0, 120)}`
      : `ShopeeFood #${shortCode}`
    : remark
      ? `ShopeeFood · ${remark.slice(0, 120)}`
      : 'ShopeeFood'

  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: 'delivery',
    table_name: tableName,
    /** 중복 수신 시 동일 문자열로 조회 (주문 비고는 table_name에 반영) */
    memo,
    discount_amt: 0,
    discount_reason: '',
    delivery_fee: deliveryFee,
    packaging_fee: packagingFee,
    items_json: JSON.stringify(items),
    subtotal,
    vat: pricing.vatFeeAmt,
    total: pricing.finalTotal,
    status: 'pending',
    payment_cash: paymentMethod === 'CASH_ON_DELIVERY' ? pricing.finalTotal : 0,
    payment_card: 0,
    payment_qr: 0,
    payment_other: paymentMethod === 'ONLINE_PAYMENT' ? pricing.finalTotal : 0,
    member_id: null,
    member_no: null,
    coupon_code: null,
    coupon_discount_amt: 0,
    point_used: 0,
    point_earned: 0,
    guest_count: 0,
    delivery_app_code: 'shopee',
  }

  const inserted = (await supabaseInsert('pos_orders', row)) as { id?: number }[]
  const created = Array.isArray(inserted) ? inserted[0] : inserted
  if (!created?.id) {
    return { ok: false, message: 'insert failed' }
  }

  return { ok: true, orderNo, orderId: Number(created.id) }
}
