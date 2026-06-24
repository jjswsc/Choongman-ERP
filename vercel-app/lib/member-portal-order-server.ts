import { createMemberPickupOrderWithPrepay } from '@/lib/member-portal-checkout-server'
import type { MemberSummary } from '@/lib/members-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type MemberPortalDeliveryLinks = {
  grab: string
  lineman: string
  shopee: string
}

export type MemberPickupOrderItem = {
  menuId: string
  optionId?: string
  optionCode?: string
  optionCodes?: string[]
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

export async function createMemberPickupOrder(params: {
  member: MemberSummary
  storeCode: string
  pickupAt: string
  items: MemberPickupOrderItem[]
  pointUsed?: number
  couponCode?: string
}): Promise<{
  orderId: number
  orderNo: string
  paid?: boolean
  requiresQr?: boolean
  qrAmount?: number
  pointUsed?: number
  total?: number
  createdAt?: string
  paymentExpiresAt?: string
}> {
  return createMemberPickupOrderWithPrepay(params)
}
