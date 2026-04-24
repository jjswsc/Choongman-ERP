import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { computePosPricing } from '@/lib/pos-pricing'

type GrabOrderPersistResult =
  | {
      ok: true
      orderId: number
      orderNo: string
      duplicate: boolean
      storeCode: string
    }
  | {
      ok: false
      message: string
    }

type GrabOrderStateSyncResult =
  | {
      ok: true
      updated: boolean
      orderId?: number
      status?: string
    }
  | {
      ok: false
      message: string
    }

type PosItem = {
  id: string
  name: string
  price: number
  qty: number
  note?: string
  deliveryAppCode?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toNumber(value: unknown): number {
  if (typeof value === 'string') return Number(value) || 0
  return Number(value) || 0
}

function currencyExponent(order: Record<string, unknown>): number {
  const currency = asRecord(order.currency)
  const exp = Math.trunc(toNumber(currency.exponent))
  if (exp >= 0 && exp <= 4) return exp
  return 2
}

function minorToMajor(value: unknown, exponent: number): number {
  const n = toNumber(value)
  if (!Number.isFinite(n)) return 0
  const hasDecimal = Math.abs(n % 1) > 1e-9
  if (hasDecimal || exponent <= 0) return Math.round(n * 100) / 100
  const major = n / 10 ** exponent
  return Math.round(major * 100) / 100
}

function parseGrabStoreMap(): Record<string, string> {
  const raw = process.env.GRAB_STORE_MAP_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k || '').trim()
      const val = String(v || '').trim()
      if (key && val) out[key] = val
    }
    return out
  } catch {
    return {}
  }
}

function resolveStoreCode(order: Record<string, unknown>): string {
  const partnerMerchantID = String(order.partnerMerchantID ?? '').trim()
  const merchantID = String(order.merchantID ?? '').trim()
  const map = parseGrabStoreMap()
  return map[partnerMerchantID] || map[merchantID] || partnerMerchantID
}

function buildMemo(orderID: string): string {
  return `grab_order:${orderID}`
}

function buildPosItems(order: Record<string, unknown>): PosItem[] {
  const exponent = currencyExponent(order)
  const rawItems = Array.isArray(order.items) ? order.items : []
  const out: PosItem[] = []
  let idx = 0

  for (const raw of rawItems) {
    const item = asRecord(raw)
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity) || 1))
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : []
    let modifierMinor = 0
    const modifierNames: string[] = []
    for (const m of modifiers) {
      const mod = asRecord(m)
      const modQty = Math.max(1, Math.trunc(toNumber(mod.quantity) || 1))
      modifierMinor += toNumber(mod.price) * modQty
      const modName = String(mod.name ?? mod.id ?? '').trim()
      if (modName) modifierNames.push(modName)
    }

    const unitMinor = toNumber(item.price) + modifierMinor
    const noteParts = [
      String(item.specifications ?? '').trim(),
      modifierNames.length ? `mods:${modifierNames.join(',')}` : '',
    ].filter(Boolean)

    out.push({
      id: `grab:${String(item.id ?? item.grabItemID ?? idx)}`,
      name: String(item.name ?? item.grabItemID ?? `Grab item ${idx + 1}`),
      price: minorToMajor(unitMinor, exponent),
      qty,
      note: noteParts.length ? noteParts.join(' · ') : undefined,
      deliveryAppCode: 'grab',
    })
    idx += 1
  }

  return out
}

function resolveOrderType(order: Record<string, unknown>): 'delivery' | 'dine_in' {
  const dineIn = order.dineIn
  if (dineIn && typeof dineIn === 'object') return 'dine_in'
  return 'delivery'
}

function resolveDisplayName(order: Record<string, unknown>): string {
  const short = String(order.shortOrderNumber ?? '').trim()
  const receiver = asRecord(order.receiver)
  const receiverName = String(receiver.name ?? '').trim()
  if (short && receiverName) return `Grab #${short} · ${receiverName}`
  if (short) return `Grab #${short}`
  if (receiverName) return `Grab · ${receiverName}`
  return 'Grab'
}

export async function persistGrabOrderToPos(
  order: Record<string, unknown>
): Promise<GrabOrderPersistResult> {
  const orderID = String(order.orderID ?? '').trim()
  if (!orderID) return { ok: false, message: 'missing orderID' }

  const storeCode = resolveStoreCode(order)
  if (!storeCode) {
    return {
      ok: false,
      message: 'missing storeCode (set partnerMerchantID or GRAB_STORE_MAP_JSON)',
    }
  }

  const memo = buildMemo(orderID)
  const existing = (await supabaseSelectFilter(
    'pos_orders',
    `store_code=eq.${encodeURIComponent(storeCode)}&memo=eq.${encodeURIComponent(memo)}`,
    { limit: 1, select: 'id,order_no' }
  )) as { id?: number; order_no?: string }[]
  if (existing?.[0]?.id) {
    return {
      ok: true,
      orderId: Number(existing[0].id),
      orderNo: String(existing[0].order_no ?? ''),
      duplicate: true,
      storeCode,
    }
  }

  const items = buildPosItems(order)
  if (!items.length) return { ok: false, message: 'no line items' }

  let subtotal = 0
  for (const item of items) subtotal += item.price * item.qty

  const exponent = currencyExponent(order)
  const price = asRecord(order.price)
  const deliveryFee = minorToMajor(price.deliveryFee, exponent)
  const packagingFee = minorToMajor(price.merchantChargeFee, exponent)
  const discountAmt = Math.max(0, minorToMajor(price.merchantFundPromo, exponent))
  const tax = Math.max(0, minorToMajor(price.tax, exponent))
  const totalFromWebhook = Math.max(0, minorToMajor(price.total, exponent))

  const paymentType = String(order.paymentType ?? '').trim().toUpperCase()
  const pricing = computePosPricing({
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    cardPaymentAmount: 0,
    adjustments: {},
  })
  const total = totalFromWebhook > 0 ? totalFromWebhook : pricing.finalTotal
  const vat = tax > 0 ? tax : pricing.vatFeeAmt
  const paymentCash = paymentType === 'CASH' ? total : 0
  const paymentDeliveryApp = paymentType === 'CASHLESS' ? total : 0

  const orderNo = await allocateNextPosOrderNo(storeCode)
  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: resolveOrderType(order),
    table_name: resolveDisplayName(order),
    memo,
    discount_amt: discountAmt,
    discount_reason: '',
    delivery_fee: deliveryFee,
    packaging_fee: packagingFee,
    items_json: JSON.stringify(items),
    subtotal,
    vat,
    total,
    status: 'pending',
    payment_cash: paymentCash,
    payment_card: 0,
    payment_qr: 0,
    payment_other: 0,
    payment_delivery_app: paymentDeliveryApp,
    member_id: null,
    member_no: null,
    coupon_code: null,
    coupon_discount_amt: 0,
    point_used: 0,
    point_earned: 0,
    guest_count: 0,
    delivery_app_code: 'grab',
  }

  const inserted = (await supabaseInsert('pos_orders', row)) as { id?: number }[]
  const created = Array.isArray(inserted) ? inserted[0] : inserted
  if (!created?.id) return { ok: false, message: 'insert failed' }

  return {
    ok: true,
    orderId: Number(created.id),
    orderNo,
    duplicate: false,
    storeCode,
  }
}

function mapGrabStateToPosStatus(state: string): string | null {
  const s = String(state || '').trim().toUpperCase()
  if (!s) return null
  if (s === 'REFUNDED') return 'refunded'
  if (s === 'CANCELLED' || s === 'FAILED') return 'cancelled'
  if (s === 'COLLECTED') return 'ready'
  if (s === 'BILL_PAID') return 'paid'
  if (s === 'DELIVERED' || s === 'COMPLETED') return 'completed'
  if (s === 'ACCEPTED' || s === 'DRIVER_ALLOCATED' || s === 'DRIVER_ARRIVED') return 'cooking'
  return null
}

export async function syncGrabOrderStateToPos(params: {
  orderID: string
  state: string
  orderPayload?: unknown
}): Promise<GrabOrderStateSyncResult> {
  const orderID = String(params.orderID || '').trim()
  if (!orderID) return { ok: false, message: 'missing orderID' }

  const nextStatus = mapGrabStateToPosStatus(params.state)
  if (!nextStatus) {
    return { ok: true, updated: false }
  }

  const memo = buildMemo(orderID)
  let rows = (await supabaseSelectFilter('pos_orders', `memo=eq.${encodeURIComponent(memo)}`, {
    limit: 1,
    select: 'id,status',
  })) as { id?: number; status?: string }[]

  if (!rows?.[0]?.id && params.orderPayload && typeof params.orderPayload === 'object') {
    const persisted = await persistGrabOrderToPos(params.orderPayload as Record<string, unknown>)
    if (!persisted.ok) {
      return { ok: false, message: `order_not_found_and_create_failed:${persisted.message}` }
    }
    rows = (await supabaseSelectFilter('pos_orders', `id=eq.${persisted.orderId}`, {
      limit: 1,
      select: 'id,status',
    })) as { id?: number; status?: string }[]
  }

  const row = rows?.[0]
  if (!row?.id) return { ok: false, message: 'pos_order_not_found' }

  const prevStatus = String(row.status ?? '').trim().toLowerCase()
  if (prevStatus === nextStatus) {
    return { ok: true, updated: false, orderId: Number(row.id), status: nextStatus }
  }

  await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(row.id)}`, { status: nextStatus })
  return { ok: true, updated: true, orderId: Number(row.id), status: nextStatus }
}
