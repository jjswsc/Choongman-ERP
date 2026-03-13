import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 프린터 설정 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const kitchenMode = Math.min(2, Math.max(1, Number(body?.kitchenMode) || 1))
    const kitchen1Categories = Array.isArray(body?.kitchen1Categories)
      ? body.kitchen1Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const kitchen2Categories = Array.isArray(body?.kitchen2Categories)
      ? body.kitchen2Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const autoStockDeduction = Boolean(body?.autoStockDeduction)
    const deliveryFee = Math.max(0, Number(body?.deliveryFee ?? 0))
    const packagingFee = Math.max(0, Number(body?.packagingFee ?? 0))
    const cookingFreshMaxMin = Math.max(1, Number(body?.cookingFreshMaxMin ?? 10))
    const cookingWarningMaxMin = Math.max(cookingFreshMaxMin + 1, Number(body?.cookingWarningMaxMin ?? 15))
    const cookingRuleMode = String(body?.cookingRuleMode || 'elapsed') === 'recipe_diff' ? 'recipe_diff' : 'elapsed'
    const cookingRecipeWarningDiffMin = Math.max(0, Number(body?.cookingRecipeWarningDiffMin ?? 0))
    const cookingRecipeUrgentDiffMin = Math.max(cookingRecipeWarningDiffMin + 1, Number(body?.cookingRecipeUrgentDiffMin ?? 5))
    const cookingDelayBadgeEnabled = body?.cookingDelayBadgeEnabled !== false
    const cookingDelaySoundEnabled = Boolean(body?.cookingDelaySoundEnabled)
    const cookingDelayAlertOverMin = Math.max(0, Number(body?.cookingDelayAlertOverMin ?? 0))

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const existing = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { store_code?: string }[] | null

    const patch = {
      kitchen_mode: kitchenMode,
      kitchen1_categories: kitchen1Categories,
      kitchen2_categories: kitchen2Categories,
      auto_stock_deduction: autoStockDeduction,
      delivery_fee: deliveryFee,
      packaging_fee: packagingFee,
      cooking_fresh_max_min: cookingFreshMaxMin,
      cooking_warning_max_min: cookingWarningMaxMin,
      cooking_rule_mode: cookingRuleMode,
      cooking_recipe_warning_diff_min: cookingRecipeWarningDiffMin,
      cooking_recipe_urgent_diff_min: cookingRecipeUrgentDiffMin,
      cooking_delay_badge_enabled: cookingDelayBadgeEnabled,
      cooking_delay_sound_enabled: cookingDelaySoundEnabled,
      cooking_delay_alert_over_min: cookingDelayAlertOverMin,
      updated_at: new Date().toISOString(),
    }

    if (existing?.length) {
      await supabaseUpdateByFilter(
        'pos_printer_settings',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        patch
      )
    } else {
      await supabaseInsert('pos_printer_settings', {
        store_code: storeCode,
        ...patch,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosPrinterSettings:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
