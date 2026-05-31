import { supabaseInsertWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertMemberPickupTimeAllowed as assertPickupTime } from '@/lib/member-portal-pickup-time'
import { computePosPricing } from '@/lib/pos-pricing'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { enrichOrderItemsWithOptionCode } from '@/lib/pos-option-code-enrich'
import type { MemberSummary } from '@/lib/members-server'

export type MemberPortalDeliveryLinks = {
  grab: string
  lineman: string
  shopee: string
}

export type MemberPickupOrderItem = {
  menuId: string
  optionId?: string
  optionCode?: string
  code?: string | number
  name: string
  price: number
  qty: number
}

export async function loadMemberPortalDeliveryLinks(): Promise<MemberPortalDeliveryLinks> {
  const defaults: MemberPortalDeliveryLinks = {
    grab: 'https://food.grab.com/th/th/',
    lineman: 'https://lineman.line.me/',
    shopee: 'https://shopeefood.th/',
  }
  try {
    const keys = [
      'member_portal_delivery_grab_url',
      'member_portal_delivery_lineman_url',
      'member_portal_delivery_shopee_url',
    ]
    const filter = `or=(${keys.map((k) => `key.eq.${k}`).join(',')})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]
    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      const value = String(row.value_json ?? '').trim().replace(/^"|"$/g, '')
      if (key && value) map.set(key, value)
    }
    return {
      grab: map.get('member_portal_delivery_grab_url') || defaults.grab,
      lineman: map.get('member_portal_delivery_lineman_url') || defaults.lineman,
      shopee: map.get('member_portal_delivery_shopee_url') || defaults.shopee,
    }
  } catch {
    return defaults
  }
}

async function loadStorePackagingFee(storeCode: string): Promise<number> {
  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1, select: 'packaging_fee' }
    )) as { packaging_fee?: number | null }[] | null
    return Math.max(0, Number(rows?.[0]?.packaging_fee ?? 0))
  } catch {
    return 0
  }
}

export async function createMemberPickupOrder(params: {
  member: MemberSummary
  storeCode: string
  pickupAt: string
  items: MemberPickupOrderItem[]
}): Promise<{ orderId: number; orderNo: string }> {
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode) throw new Error('store_required')
  const itemsIn = (params.items || []).filter((it) => it.qty > 0 && String(it.name || '').trim())
  if (itemsIn.length === 0) throw new Error('empty_cart')

  const pickupLabel = assertPickupTime(params.pickupAt)
  const member = params.member
  const memberName = String(member.fullName || member.name || '').trim()
  const memberNo = String(member.memberNo || `M${member.id}`).trim()
  const memo = [
    '[회원주문]',
    '회원 주문입니다',
    `픽업희망:${pickupLabel.slice(0, 16)}`,
    memberName ? `회원:${memberName}` : '',
    memberNo ? `번호:${memberNo}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const items = await enrichOrderItemsWithOptionCode(
    itemsIn.map((it) => {
      const optionIdRaw = String(it.optionId || '').trim()
      const optionId = /^\d+$/.test(optionIdRaw) ? optionIdRaw : undefined
      const optionCode = String(it.optionCode || '').trim() || undefined
      return {
        menuId: String(it.menuId || ''),
        ...(optionId ? { optionId } : {}),
        ...(optionCode ? { optionCode } : {}),
        code: it.code,
        name: String(it.name || '').trim(),
        price: Math.max(0, Number(it.price || 0)),
        qty: Math.max(1, Math.trunc(Number(it.qty || 1))),
      }
    })
  )

  let subtotal = 0
  for (const it of items) {
    subtotal += Number(it.price || 0) * Math.max(1, Math.trunc(Number(it.qty || 1)))
  }

  const packagingFee = await loadStorePackagingFee(storeCode)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: 0,
    deliveryFee: 0,
    packagingFee,
    cardPaymentAmount: 0,
  })

  const orderNo = await allocateNextPosOrderNo(storeCode)
  const orderType = coercePosOrderTypeForDb('takeout')
  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: orderType,
    table_name: '',
    memo,
    discount_amt: 0,
    delivery_fee: 0,
    packaging_fee: packagingFee,
    items_json: JSON.stringify(items),
    subtotal,
    vat: pricing.vatFeeAmt,
    total: pricing.finalTotal,
    status: 'pending',
    payment_cash: 0,
    payment_card: 0,
    payment_qr: 0,
    payment_other: 0,
    payment_delivery_app: 0,
    member_id: member.id,
    member_no: memberNo,
    point_used: 0,
    point_earned: 0,
    guest_count: 0,
    created_by: `member_portal:${member.id}`,
  }

  const inserted = (await supabaseInsertWithPgrst204Fallback(
    'pos_orders',
    row,
    'memberPortalPickupOrder'
  )) as { id?: number }[]
  const created = inserted?.[0]
  if (!created?.id) throw new Error('order_create_failed')
  return { orderId: Number(created.id), orderNo }
}
