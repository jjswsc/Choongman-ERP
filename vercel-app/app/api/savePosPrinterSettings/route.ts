import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

function extractMissingColumnName(error: unknown): string | null {
  const msg = String(error ?? '')
  const m = msg.match(/Could not find the '([^']+)' column/i)
  return m?.[1] || null
}

async function saveWithMissingColumnFallback(params: {
  storeCode: string
  exists: boolean
  patch: Record<string, unknown>
}) {
  const { storeCode, exists } = params
  const workingPatch: Record<string, unknown> = { ...params.patch }

  // 컬럼 미존재(PGRST204) 시 해당 키를 제거하고 재시도
  for (let i = 0; i < 40; i++) {
    try {
      if (exists) {
        await supabaseUpdateByFilter(
          'pos_printer_settings',
          `store_code=eq.${encodeURIComponent(storeCode)}`,
          workingPatch
        )
      } else {
        await supabaseInsert('pos_printer_settings', {
          store_code: storeCode,
          ...workingPatch,
        })
      }
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
    const receiptBarcode = body?.receiptBarcode !== false
    const itemBarcode = body?.itemBarcode !== false
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
    const validPrintLangs = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']
    const receiptPrintLangRaw = String(body?.receiptPrintLang ?? '').trim()
    const receiptPrintLang = receiptPrintLangRaw && validPrintLangs.includes(receiptPrintLangRaw) ? receiptPrintLangRaw : ''

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
      updated_at: new Date().toISOString(),
    }

    await saveWithMissingColumnFallback({
      storeCode,
      exists: Boolean(existing?.length),
      patch,
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosPrinterSettings:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
