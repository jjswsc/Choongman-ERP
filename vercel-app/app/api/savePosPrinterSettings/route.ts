import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsertMerge } from '@/lib/supabase-server'
import { normalizeKitchenRouteMapInput } from '@/lib/pos-kitchen-slip-routing'

/** JSON 본문에서 true/false 문자열 등도 안전하게 해석 (지연 배지 등) */
function parseBoolParam(v: unknown, defaultVal: boolean): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return defaultVal
}

function parseCookingInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function extractMissingColumnName(error: unknown): string | null {
  const msg = String(error ?? '')
  const m = msg.match(/Could not find the '([^']+)' column/i)
  return m?.[1] || null
}

async function upsertWithMissingColumnFallback(storeCode: string, patch: Record<string, unknown>) {
  const workingPatch: Record<string, unknown> = { ...patch }

  // 컬럼 미존재(PGRST204) 시 해당 키를 제거하고 재시도 (store_code PK upsert 한 번에 처리)
  for (let i = 0; i < 40; i++) {
    try {
      await supabaseUpsertMerge('pos_printer_settings', 'store_code', {
        store_code: storeCode,
        ...workingPatch,
      })
      return
    } catch (e) {
      const missingCol = extractMissingColumnName(e)
      if (!missingCol) throw e
      if (!(missingCol in workingPatch)) throw e
      delete workingPatch[missingCol]
      console.warn(`savePosPrinterSettings: skip missing column '${missingCol}'`)
    }
  }
  throw new Error('savePosPrinterSettings: too many missing-column retries')
}

/** POS 프린터 설정 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const kitchenMode = Math.min(3, Math.max(1, Number(body?.kitchenMode) || 1))
    const kitchen1Categories = Array.isArray(body?.kitchen1Categories)
      ? body.kitchen1Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const kitchen2Categories = Array.isArray(body?.kitchen2Categories)
      ? body.kitchen2Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const kitchen3Categories = Array.isArray(body?.kitchen3Categories)
      ? body.kitchen3Categories.filter((c: unknown) => typeof c === 'string')
      : []
    const autoStockDeduction = Boolean(body?.autoStockDeduction)
    const deliveryFee = Math.max(0, Number(body?.deliveryFee ?? 0))
    const packagingFee = Math.max(0, Number(body?.packagingFee ?? 0))
    const cookingFreshMaxMin = Math.max(1, parseCookingInt(body?.cookingFreshMaxMin, 10))
    const cookingWarningMaxMin = Math.max(
      cookingFreshMaxMin + 1,
      parseCookingInt(body?.cookingWarningMaxMin, 15)
    )
    const cookingRuleMode = String(body?.cookingRuleMode || 'elapsed') === 'recipe_diff' ? 'recipe_diff' : 'elapsed'
    const cookingRecipeWarningDiffMin = Math.max(0, parseCookingInt(body?.cookingRecipeWarningDiffMin, 0))
    const cookingRecipeUrgentDiffMin = Math.max(
      cookingRecipeWarningDiffMin + 1,
      parseCookingInt(body?.cookingRecipeUrgentDiffMin, 5)
    )
    const cookingDelayBadgeEnabled = parseBoolParam(body?.cookingDelayBadgeEnabled, true)
    const cookingDelaySoundEnabled = parseBoolParam(body?.cookingDelaySoundEnabled, false)
    const cookingDelayAlertOverMin = Math.max(0, parseCookingInt(body?.cookingDelayAlertOverMin, 0))
    const cardAutoOpen = Boolean(body?.cardAutoOpen)
    const checkAutoOpen = Boolean(body?.checkAutoOpen)
    const drawerOpt = String(body?.drawerOpenOption || 'reason_only')
    const drawerOpenOption = ['password_and_reason', 'reason_only', 'force'].includes(drawerOpt) ? drawerOpt : 'reason_only'
    const logoPrint = Boolean(body?.logoPrint)
    const receiptTiming = String(body?.receiptPrintTiming || 'per_payment')
    const receiptPrintTiming = receiptTiming === 'final_payment' ? 'final_payment' : 'per_payment'
    const customerReceiptOrderDetails = body?.customerReceiptOrderDetails !== false
    const merchantReceiptOrderDetails = body?.merchantReceiptOrderDetails !== false
    const cashPaymentReceipt = Boolean(body?.cashPaymentReceipt)
    const signatureLine = Boolean(body?.signatureLine)
    const receiptBarcode = Boolean(body?.receiptBarcode)
    const itemBarcode = Boolean(body?.itemBarcode)
    const qrOpt = String(body?.qrCodeOption || 'yes')
    const qrCodeOption = ['yes', 'no', 'return_points'].includes(qrOpt) ? qrOpt : 'yes'
    const discountSeparatePrint = body?.discountSeparatePrint !== false
    const merchantReceiptPrint = body?.merchantReceiptPrint !== false
    const actualOrderDetails = body?.actualOrderDetails !== false
    const toppingOptionsPrint = Boolean(body?.toppingOptionsPrint)
    const autoPrintReceiptOnOrder = Boolean(body?.autoPrintReceiptOnOrder)
    const autoPrintReceiptOnAddOrder = Boolean(body?.autoPrintReceiptOnAddOrder)
    const autoPrintReceiptOnPayment = Boolean(body?.autoPrintReceiptOnPayment)
    const autoPrintKitchenSlipOnOrder = Boolean(body?.autoPrintKitchenSlipOnOrder)
    const receiptBizName = String(body?.receiptBizName ?? '').trim()
    const receiptBizTaxId = String(body?.receiptBizTaxId ?? '').trim()
    const receiptBizOwner = String(body?.receiptBizOwner ?? '').trim()
    const receiptBizAddress = String(body?.receiptBizAddress ?? '').trim()
    const receiptBizPhone = String(body?.receiptBizPhone ?? '').trim()
    const receiptDesignStyle = String(body?.receiptDesignStyle || 'badge') === 'simple' ? 'simple' : 'badge'
    const receiptLogoSizeRaw = String(body?.receiptLogoSize || 'md')
    const receiptLogoSize = receiptLogoSizeRaw === 'sm' ? 'sm' : receiptLogoSizeRaw === 'lg' ? 'lg' : 'md'
    const receiptShowTitle = body?.receiptShowTitle !== false
    const receiptShowPaidStamp = body?.receiptShowPaidStamp !== false
    const receiptShowThankYou = body?.receiptShowThankYou !== false
    const receiptShowCustomerCopy = body?.receiptShowCustomerCopy !== false
    const receiptFooterPrimaryText = String(body?.receiptFooterPrimaryText ?? '').trim()
    const receiptFooterSecondaryText = String(body?.receiptFooterSecondaryText ?? '').trim()
    const receiptLogoImageUrl = String(body?.receiptLogoImageUrl ?? '').trim()
    const receiptStampImageUrl = String(body?.receiptStampImageUrl ?? '').trim()
    const receiptShowStamp = body?.receiptShowStamp !== false
    const receiptStampOnlyTaxInvoice = body?.receiptStampOnlyTaxInvoice !== false
    const receiptMembershipQrImageUrl = String(body?.receiptMembershipQrImageUrl ?? '').trim()
    const receiptMembershipQrLinkUrl = String(body?.receiptMembershipQrLinkUrl ?? '').trim()
    const receiptMembershipQrText = String(body?.receiptMembershipQrText ?? '').trim()
    const receiptShowMembershipQr = Boolean(body?.receiptShowMembershipQr)
    const kitchenSlipScaleRaw = String(body?.kitchenSlipFontScale || 'md').toLowerCase()
    const kitchenSlipFontScale = kitchenSlipScaleRaw === 'sm' ? 'sm' : kitchenSlipScaleRaw === 'lg' ? 'lg' : 'md'
    const kitchenSlipShowLineNotes = body?.kitchenSlipShowLineNotes !== false
    const kitchenSlipShowOrderMemo = body?.kitchenSlipShowOrderMemo !== false
    const vatRate = Math.max(0, Number(body?.vatRate ?? 7))
    const vatMode = String(body?.vatMode || 'included') === 'separate' ? 'separate' : 'included'
    const serviceRate = Math.max(0, Number(body?.serviceRate ?? 0))
    const serviceMode = String(body?.serviceMode || 'separate') === 'included' ? 'included' : 'separate'
    const cardRate = Math.max(0, Number(body?.cardRate ?? 0))
    const cardMode = String(body?.cardMode || 'separate') === 'included' ? 'included' : 'separate'
    const rawCardBaseMode = String(body?.cardBaseMode || 'card_only')
    const cardBaseMode = rawCardBaseMode === 'card_plus_vat'
      ? 'card_plus_vat'
      : rawCardBaseMode === 'card_plus_vat_service'
        ? 'card_plus_vat_service'
        : 'card_only'
    const otherRate = Math.max(0, Number(body?.otherRate ?? 0))
    const otherMode = String(body?.otherMode || 'separate') === 'included' ? 'included' : 'separate'
    const dualMonitorEnabled = Boolean(body?.dualMonitorEnabled)
    const customerDisplayAutoOpen = body?.customerDisplayAutoOpen !== false
    const rawDisplayMonitorPreference = String(body?.customerDisplayMonitorPreference || 'secondary-first')
    const customerDisplayMonitorPreference =
      rawDisplayMonitorPreference === 'primary-only' ? 'primary-only' : 'secondary-first'
    const rawDisplayTheme = String(body?.customerDisplayTheme || 'dark')
    const customerDisplayTheme =
      rawDisplayTheme === 'light' ? 'light' : rawDisplayTheme === 'brand' ? 'brand' : 'dark'
    const customerDisplayDefaultState = String(body?.customerDisplayDefaultState || 'idle') === 'qr' ? 'qr' : 'idle'
    const customerDisplayIdleMessage = String(body?.customerDisplayIdleMessage ?? '').trim()
    const customerDisplayPaymentMessage = String(body?.customerDisplayPaymentMessage ?? '').trim()
    const customerDisplayQrPayload = String(body?.customerDisplayQrPayload ?? '').trim()
    const customerDisplayShowOrderSummary = body?.customerDisplayShowOrderSummary !== false
    const customerDisplayShowOrderTotal = body?.customerDisplayShowOrderTotal !== false
    const validPrintLangs = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']
    const receiptPrintLangRaw = String(body?.receiptPrintLang ?? '').trim()
    const receiptPrintLang = receiptPrintLangRaw && validPrintLangs.includes(receiptPrintLangRaw) ? receiptPrintLangRaw : ''

    const routeMenuPatch =
      body?.kitchenRouteByMenu !== undefined ? normalizeKitchenRouteMapInput(body.kitchenRouteByMenu) : undefined
    const routeCatPatch =
      body?.kitchenRouteByCategory !== undefined
        ? normalizeKitchenRouteMapInput(body.kitchenRouteByCategory)
        : undefined
    const routeMainPatch =
      body?.kitchenRouteByCategoryMain !== undefined
        ? normalizeKitchenRouteMapInput(body.kitchenRouteByCategoryMain)
        : undefined

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const patch = {
      kitchen_mode: kitchenMode,
      kitchen1_categories: kitchen1Categories,
      kitchen2_categories: kitchen2Categories,
      kitchen3_categories: kitchen3Categories,
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
      card_auto_open: cardAutoOpen,
      check_auto_open: checkAutoOpen,
      drawer_open_option: drawerOpenOption,
      logo_print: logoPrint,
      receipt_print_timing: receiptPrintTiming,
      customer_receipt_order_details: customerReceiptOrderDetails,
      merchant_receipt_order_details: merchantReceiptOrderDetails,
      cash_payment_receipt: cashPaymentReceipt,
      signature_line: signatureLine,
      receipt_barcode: receiptBarcode,
      item_barcode: itemBarcode,
      qr_code_option: qrCodeOption,
      discount_separate_print: discountSeparatePrint,
      merchant_receipt_print: merchantReceiptPrint,
      actual_order_details: actualOrderDetails,
      topping_options_print: toppingOptionsPrint,
      auto_print_receipt_on_order: autoPrintReceiptOnOrder,
      auto_print_receipt_on_add_order: autoPrintReceiptOnAddOrder,
      auto_print_receipt_on_payment: autoPrintReceiptOnPayment,
      auto_print_kitchen_slip_on_order: autoPrintKitchenSlipOnOrder,
      receipt_biz_name: receiptBizName,
      receipt_biz_tax_id: receiptBizTaxId,
      receipt_biz_owner: receiptBizOwner,
      receipt_biz_address: receiptBizAddress,
      receipt_biz_phone: receiptBizPhone,
      receipt_design_style: receiptDesignStyle,
      receipt_logo_size: receiptLogoSize,
      receipt_show_title: receiptShowTitle,
      receipt_show_paid_stamp: receiptShowPaidStamp,
      receipt_show_thank_you: receiptShowThankYou,
      receipt_show_customer_copy: receiptShowCustomerCopy,
      receipt_footer_primary_text: receiptFooterPrimaryText,
      receipt_footer_secondary_text: receiptFooterSecondaryText,
      receipt_logo_image_url: receiptLogoImageUrl,
      receipt_stamp_image_url: receiptStampImageUrl,
      receipt_show_stamp: receiptShowStamp,
      receipt_stamp_only_tax_invoice: receiptStampOnlyTaxInvoice,
      receipt_membership_qr_image_url: receiptMembershipQrImageUrl,
      receipt_membership_qr_link_url: receiptMembershipQrLinkUrl,
      receipt_membership_qr_text: receiptMembershipQrText,
      receipt_show_membership_qr: receiptShowMembershipQr,
      kitchen_slip_font_scale: kitchenSlipFontScale,
      kitchen_slip_show_line_notes: kitchenSlipShowLineNotes,
      kitchen_slip_show_order_memo: kitchenSlipShowOrderMemo,
      receipt_print_lang: receiptPrintLang,
      vat_rate: vatRate,
      vat_mode: vatMode,
      service_rate: serviceRate,
      service_mode: serviceMode,
      card_rate: cardRate,
      card_mode: cardMode,
      card_base_mode: cardBaseMode,
      other_rate: otherRate,
      other_mode: otherMode,
      dual_monitor_enabled: dualMonitorEnabled,
      customer_display_auto_open: customerDisplayAutoOpen,
      customer_display_monitor_preference: customerDisplayMonitorPreference,
      customer_display_theme: customerDisplayTheme,
      customer_display_default_state: customerDisplayDefaultState,
      customer_display_idle_message: customerDisplayIdleMessage,
      customer_display_payment_message: customerDisplayPaymentMessage,
      customer_display_qr_payload: customerDisplayQrPayload,
      customer_display_show_order_summary: customerDisplayShowOrderSummary,
      customer_display_show_order_total: customerDisplayShowOrderTotal,
      updated_at: new Date().toISOString(),
      ...(routeMenuPatch !== undefined ? { kitchen_route_by_menu: routeMenuPatch } : {}),
      ...(routeCatPatch !== undefined ? { kitchen_route_by_category: routeCatPatch } : {}),
      ...(routeMainPatch !== undefined ? { kitchen_route_by_category_main: routeMainPatch } : {}),
    }

    await upsertWithMissingColumnFallback(storeCode, patch)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosPrinterSettings:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
