import { NextRequest, NextResponse } from 'next/server'
import { mapPosCouponDbRow } from '@/lib/pos-coupon-server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 쿠폰 목록 조회 */
export async function GET(_req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const rows = (await supabaseSelect('pos_coupons', {
      order: 'code',
      limit: 500,
    })) as {
      id?: number
      code?: string
      name?: string
      discount_type?: string
      discount_value?: number
      valid_from?: string | null
      valid_to?: string | null
      is_active?: boolean
      marketing_campaign_id?: number | null
      min_order_amt?: number
      max_per_order?: number
      redemption_mode?: string
      allow_quantity_entry?: boolean
      stack_mode?: string
      max_discount_amt?: number | null
      max_uses?: number | null
      used_count?: number
    }[]
    const list = (rows || []).map((r) => {
      const mapped = mapPosCouponDbRow(r)
      if (!mapped) return null
      return {
        id: mapped.id,
        code: mapped.code,
        name: mapped.name ?? mapped.code,
        discountType: mapped.discountType,
        discountValue: mapped.discountValue,
        validFrom: mapped.validFrom,
        validTo: mapped.validTo,
        isActive: mapped.isActive !== false,
        marketingCampaignId: r.marketing_campaign_id != null ? String(r.marketing_campaign_id) : null,
        minOrderAmt: mapped.minOrderAmt ?? 0,
        maxPerOrder: mapped.maxPerOrder ?? 1,
        redemptionMode: mapped.redemptionMode ?? 'reusable_code',
        allowQuantityEntry: Boolean(mapped.allowQuantityEntry),
        stackMode: mapped.stackMode ?? 'fixed_only',
        maxDiscountAmt: mapped.maxDiscountAmt ?? null,
        maxUses: mapped.maxUses ?? null,
        usedCount: mapped.usedCount ?? 0,
      }
    }).filter(Boolean)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosCoupons:', e)
    return NextResponse.json([], { headers })
  }
}
