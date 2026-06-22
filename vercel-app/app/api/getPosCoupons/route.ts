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
      benefit_kind?: string | null
      set_qty?: number | null
      item_scope_json?: Record<string, unknown> | null
      priority?: number | null
      combinable_with_manual_discount?: boolean | null
      portal_image_url?: string | null
      portal_visible?: boolean | null
      portal_claim_mode?: string | null
      portal_point_cost?: number | null
      portal_max_claims_per_member?: number | null
      portal_sort_order?: number | null
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
        setQty: mapped.setQty ?? null,
        itemScope: mapped.itemScope ?? null,
        priority: mapped.priority ?? 0,
        allowWithManualDiscount: mapped.allowWithManualDiscount !== false,
        portalImageUrl: String(r.portal_image_url ?? '').trim(),
        portalVisible: Boolean(r.portal_visible),
        portalClaimMode:
          String(r.portal_claim_mode ?? 'none').trim().toLowerCase() === 'free' ||
          String(r.portal_claim_mode ?? 'none').trim().toLowerCase() === 'points'
            ? (String(r.portal_claim_mode).trim().toLowerCase() as 'free' | 'points')
            : 'none',
        portalPointCost: Math.max(0, Math.trunc(Number(r.portal_point_cost ?? 0))),
        portalMaxClaimsPerMember: Math.max(
          1,
          Math.trunc(Number(r.portal_max_claims_per_member ?? 1))
        ),
        portalSortOrder: Math.trunc(Number(r.portal_sort_order ?? 0)),
      }
    }).filter(Boolean)
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosCoupons:', e)
    return NextResponse.json([], { headers })
  }
}
