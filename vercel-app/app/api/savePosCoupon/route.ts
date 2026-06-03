import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

function normalizeRedemptionMode(raw: unknown): string {
  const s = String(raw ?? 'reusable_code').trim()
  if (s === 'single_use_serial' || s === 'member_issue') return s
  return 'reusable_code'
}

function normalizeStackMode(raw: unknown): string {
  const s = String(raw ?? 'fixed_only').trim()
  if (s === 'percent_only' || s === 'any') return s
  return 'fixed_only'
}

function normalizeDiscountType(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (s === 'percent') return 'percent'
  if (s === 'bogo' || s === 'set_fixed' || s === 'item_fixed') return s
  return 'fixed'
}

/** POS 쿠폰 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await req.json()
    const id = body.id != null ? Number(body.id) : undefined
    const code = String(body.code ?? '').trim().toUpperCase()
    const name = String(body.name ?? '').trim()
    const discountType = normalizeDiscountType(body.discountType)
    const discountValue = Math.max(0, Number(body.discountValue) ?? 0)
    const validFrom = body.validFrom?.trim() || null
    const validTo = body.validTo?.trim() || null
    const isActive = Boolean(body.isActive !== false)
    const marketingCampaignId = body.marketingCampaignId && body.marketingCampaignId !== 'null' ? Number(body.marketingCampaignId) : null
    const minOrderAmt = Math.max(0, Number(body.minOrderAmt ?? 0))
    const maxPerOrder = Math.max(1, Math.trunc(Number(body.maxPerOrder ?? 1) || 1))
    const redemptionMode = normalizeRedemptionMode(body.redemptionMode)
    const allowQuantityEntry = Boolean(body.allowQuantityEntry)
    const stackMode = normalizeStackMode(body.stackMode)
    const maxDiscountAmt =
      body.maxDiscountAmt != null && String(body.maxDiscountAmt).trim() !== ''
        ? Math.max(0, Number(body.maxDiscountAmt))
        : null
    const maxUses =
      body.maxUses != null && String(body.maxUses).trim() !== ''
        ? Math.max(1, Math.trunc(Number(body.maxUses)))
        : null
    const setQty =
      body.setQty != null && String(body.setQty).trim() !== ''
        ? Math.max(2, Math.trunc(Number(body.setQty) || 2))
        : null
    const itemScope =
      body.itemScope && typeof body.itemScope === 'object'
        ? (body.itemScope as Record<string, unknown>)
        : null
    const priority =
      body.priority != null && String(body.priority).trim() !== ''
        ? Math.max(-100, Math.min(100, Math.trunc(Number(body.priority) || 0)))
        : 0
    const allowWithManualDiscount =
      body.allowWithManualDiscount == null ? true : Boolean(body.allowWithManualDiscount)

    if (!code) {
      return NextResponse.json({ success: false, message: '쿠폰 코드를 입력하세요.' }, { headers })
    }
    if (discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
      return NextResponse.json({ success: false, message: '할인율은 1~100입니다.' }, { headers })
    }
    if (discountType !== 'percent' && discountValue < 0) {
      return NextResponse.json({ success: false, message: '할인 금액은 0 이상이어야 합니다.' }, { headers })
    }

    const row = {
      code,
      name: name || code,
      discount_type: discountType === 'percent' ? 'percent' : 'fixed',
      benefit_kind: discountType === 'percent' || discountType === 'fixed' ? null : discountType,
      discount_value: discountValue,
      valid_from: validFrom,
      valid_to: validTo,
      is_active: isActive,
      marketing_campaign_id: marketingCampaignId,
      min_order_amt: minOrderAmt,
      max_per_order: maxPerOrder,
      redemption_mode: redemptionMode,
      allow_quantity_entry: allowQuantityEntry,
      stack_mode: stackMode,
      max_discount_amt: maxDiscountAmt,
      max_uses: maxUses,
      set_qty: setQty,
      item_scope_json: itemScope,
      priority,
      combinable_with_manual_discount: allowWithManualDiscount,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const existing = (await supabaseSelectFilter('pos_coupons', `id=eq.${id}`, { limit: 1 })) as unknown[]
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '쿠폰을 찾을 수 없습니다.' }, { headers })
      }
      const byCode = (await supabaseSelectFilter('pos_coupons', `code=eq.${encodeURIComponent(code)}`, { limit: 2 })) as { id?: number }[]
      if (byCode?.some((r) => r.id !== id)) {
        return NextResponse.json({ success: false, message: '이미 사용 중인 쿠폰 코드입니다.' }, { headers })
      }
      await supabaseUpdate('pos_coupons', id, row)
    } else {
      const byCode = (await supabaseSelectFilter('pos_coupons', `code=eq.${encodeURIComponent(code)}`, { limit: 1 })) as unknown[]
      if (byCode?.length) {
        return NextResponse.json({ success: false, message: '이미 사용 중인 쿠폰 코드입니다.' }, { headers })
      }
      await supabaseInsert('pos_coupons', row)
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosCoupon:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
