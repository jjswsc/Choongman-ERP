import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 프린터 설정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!storeCode) {
    return NextResponse.json(
      {
        kitchenMode: 1,
        kitchen1Categories: [],
        kitchen2Categories: [],
        autoStockDeduction: false,
        deliveryFee: 0,
        packagingFee: 0,
        cookingFreshMaxMin: 10,
        cookingWarningMaxMin: 15,
        cookingRuleMode: 'elapsed',
        cookingRecipeWarningDiffMin: 0,
        cookingRecipeUrgentDiffMin: 5,
        cookingDelayBadgeEnabled: true,
        cookingDelaySoundEnabled: false,
        cookingDelayAlertOverMin: 0,
      },
      { headers }
    )
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as {
      store_code?: string
      kitchen_mode?: number
      kitchen1_categories?: unknown
      kitchen2_categories?: unknown
      auto_stock_deduction?: boolean
      delivery_fee?: number
      packaging_fee?: number
      cooking_fresh_max_min?: number
      cooking_warning_max_min?: number
      cooking_rule_mode?: string
      cooking_recipe_warning_diff_min?: number
      cooking_recipe_urgent_diff_min?: number
      cooking_delay_badge_enabled?: boolean
      cooking_delay_sound_enabled?: boolean
      cooking_delay_alert_over_min?: number
    }[] | null

    const raw = rows?.[0]
    const kitchen1 = Array.isArray(raw?.kitchen1_categories)
      ? (raw.kitchen1_categories as string[]).filter((c) => typeof c === 'string')
      : []
    const kitchen2 = Array.isArray(raw?.kitchen2_categories)
      ? (raw.kitchen2_categories as string[]).filter((c) => typeof c === 'string')
      : []

    return NextResponse.json({
      storeCode,
      kitchenMode: Number(raw?.kitchen_mode) || 1,
      kitchen1Categories: kitchen1.filter((c) => typeof c === 'string'),
      kitchen2Categories: kitchen2.filter((c) => typeof c === 'string'),
      autoStockDeduction: Boolean(raw?.auto_stock_deduction),
      deliveryFee: Math.max(0, Number(raw?.delivery_fee ?? 0)),
      packagingFee: Math.max(0, Number(raw?.packaging_fee ?? 0)),
      cookingFreshMaxMin: Math.max(1, Number(raw?.cooking_fresh_max_min ?? 10)),
      cookingWarningMaxMin: Math.max(2, Number(raw?.cooking_warning_max_min ?? 15)),
      cookingRuleMode: String(raw?.cooking_rule_mode || 'elapsed') === 'recipe_diff' ? 'recipe_diff' : 'elapsed',
      cookingRecipeWarningDiffMin: Math.max(0, Number(raw?.cooking_recipe_warning_diff_min ?? 0)),
      cookingRecipeUrgentDiffMin: Math.max(1, Number(raw?.cooking_recipe_urgent_diff_min ?? 5)),
      cookingDelayBadgeEnabled: raw?.cooking_delay_badge_enabled !== false,
      cookingDelaySoundEnabled: Boolean(raw?.cooking_delay_sound_enabled),
      cookingDelayAlertOverMin: Math.max(0, Number(raw?.cooking_delay_alert_over_min ?? 0)),
    }, { headers })
  } catch (e) {
    console.error('getPosPrinterSettings:', e)
    return NextResponse.json(
      {
        kitchenMode: 1,
        kitchen1Categories: [],
        kitchen2Categories: [],
        autoStockDeduction: false,
        deliveryFee: 0,
        packagingFee: 0,
        cookingFreshMaxMin: 10,
        cookingWarningMaxMin: 15,
        cookingRuleMode: 'elapsed',
        cookingRecipeWarningDiffMin: 0,
        cookingRecipeUrgentDiffMin: 5,
        cookingDelayBadgeEnabled: true,
        cookingDelaySoundEnabled: false,
        cookingDelayAlertOverMin: 0,
      },
      { headers }
    )
  }
}
