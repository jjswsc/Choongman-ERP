import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  DEFAULT_POS_LOYALTY_SETTINGS,
  type PosLoyaltySettings,
} from '@/lib/pos-coupon-domain'

type LoyaltyRow = {
  brand_key?: string
  max_coupons_per_order?: number
  coupon_stack_with_manual_discount?: boolean
  coupon_stack_with_points?: boolean
  coupon_calc_base?: string
}

export async function loadPosLoyaltySettings(brandKey = 'default'): Promise<PosLoyaltySettings> {
  try {
    const rows = (await supabaseSelectFilter('pos_loyalty_settings', `brand_key=eq.${encodeURIComponent(brandKey)}`, {
      limit: 1,
    })) as LoyaltyRow[] | null
    const row = rows?.[0]
    if (!row) return { ...DEFAULT_POS_LOYALTY_SETTINGS, brandKey }
    const calcBase = String(row.coupon_calc_base ?? '').trim()
    return {
      brandKey: String(row.brand_key ?? brandKey),
      maxCouponsPerOrder: Math.max(1, Math.trunc(Number(row.max_coupons_per_order ?? 10) || 10)),
      couponStackWithManualDiscount: row.coupon_stack_with_manual_discount !== false,
      couponStackWithPoints: row.coupon_stack_with_points !== false,
      couponCalcBase: calcBase === 'subtotal' ? 'subtotal' : 'remaining',
    }
  } catch {
    return { ...DEFAULT_POS_LOYALTY_SETTINGS, brandKey }
  }
}

export async function listPosLoyaltySettings(): Promise<PosLoyaltySettings[]> {
  try {
    const rows = (await supabaseSelect('pos_loyalty_settings', { order: 'brand_key', limit: 20 })) as LoyaltyRow[]
    if (!rows?.length) return [DEFAULT_POS_LOYALTY_SETTINGS]
    return rows.map((row) => ({
      brandKey: String(row.brand_key ?? 'default'),
      maxCouponsPerOrder: Math.max(1, Math.trunc(Number(row.max_coupons_per_order ?? 10) || 10)),
      couponStackWithManualDiscount: row.coupon_stack_with_manual_discount !== false,
      couponStackWithPoints: row.coupon_stack_with_points !== false,
      couponCalcBase: String(row.coupon_calc_base ?? '') === 'subtotal' ? 'subtotal' : 'remaining',
    }))
  } catch {
    return [DEFAULT_POS_LOYALTY_SETTINGS]
  }
}
