import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type VendorBizInfo = {
  name?: string
  tax_id?: string
  ceo?: string
  addr?: string
  phone?: string
}

async function getStoreReceiptBizFallback(storeCode: string): Promise<{
  receiptBizName: string
  receiptBizTaxId: string
  receiptBizOwner: string
  receiptBizAddress: string
  receiptBizPhone: string
}> {
  const s = String(storeCode || '').trim()
  if (!s) {
    return {
      receiptBizName: '',
      receiptBizTaxId: '',
      receiptBizOwner: '',
      receiptBizAddress: '',
      receiptBizPhone: '',
    }
  }

  const variants = Array.from(new Set([
    s,
    s.replace(/^CM\s+/i, '').trim(),
    s.match(/^CM\s+/i) ? '' : `CM ${s}`.trim(),
  ].filter(Boolean)))

  let row: VendorBizInfo | null = null
  for (const v of variants) {
    const byGps = (await supabaseSelectFilter('vendors', `gps_name=eq.${encodeURIComponent(v)}`, { limit: 1 })) as VendorBizInfo[] | null
    if (byGps?.length) { row = byGps[0]; break }
  }
  if (!row) {
    for (const v of variants) {
      const byName = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(v)}`, { limit: 1 })) as VendorBizInfo[] | null
      if (byName?.length) { row = byName[0]; break }
    }
  }
  if (!row) {
    const hq = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as VendorBizInfo[] | null
    row = hq?.[0] || null
  }
  if (!row) {
    const hqEn = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as VendorBizInfo[] | null
    row = hqEn?.[0] || null
  }

  return {
    receiptBizName: String(row?.name || '').trim(),
    receiptBizTaxId: String(row?.tax_id || '').trim(),
    receiptBizOwner: String(row?.ceo || '').trim(),
    receiptBizAddress: String(row?.addr || '').trim(),
    receiptBizPhone: String(row?.phone || '').trim(),
  }
}

/** POS 프린터 설정 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  const defaultRes = {
    kitchenMode: 1,
    kitchen1Categories: [] as string[],
    kitchen2Categories: [] as string[],
    autoStockDeduction: false,
    deliveryFee: 0,
    packagingFee: 0,
    cookingFreshMaxMin: 10,
    cookingWarningMaxMin: 15,
    cookingRuleMode: 'elapsed' as const,
    cookingRecipeWarningDiffMin: 0,
    cookingRecipeUrgentDiffMin: 5,
    cookingDelayBadgeEnabled: true,
    cookingDelaySoundEnabled: false,
    cookingDelayAlertOverMin: 0,
    cardAutoOpen: false,
    checkAutoOpen: false,
    drawerOpenOption: 'reason_only' as const,
    logoPrint: false,
    receiptPrintTiming: 'per_payment' as const,
    customerReceiptOrderDetails: true,
    merchantReceiptOrderDetails: true,
    cashPaymentReceipt: false,
    signatureLine: false,
    receiptBarcode: true,
    itemBarcode: true,
    qrCodeOption: 'yes' as const,
    discountSeparatePrint: true,
    merchantReceiptPrint: true,
    actualOrderDetails: true,
    toppingOptionsPrint: false,
    autoPrintReceiptOnOrder: false,
    autoPrintReceiptOnAddOrder: false,
    autoPrintReceiptOnPayment: false,
    autoPrintKitchenSlipOnOrder: false,
    receiptBizName: '',
    receiptBizTaxId: '',
    receiptBizOwner: '',
    receiptBizAddress: '',
    receiptBizPhone: '',
    receiptDesignStyle: 'badge' as const,
    receiptLogoSize: 'md' as const,
    receiptShowTitle: true,
    receiptShowPaidStamp: true,
    receiptShowThankYou: true,
    receiptShowCustomerCopy: true,
    vatRate: 7,
    vatMode: 'included' as const,
    serviceRate: 0,
    serviceMode: 'separate' as const,
    cardRate: 0,
    cardMode: 'separate' as const,
    cardBaseMode: 'card_only' as const,
    otherRate: 0,
    otherMode: 'separate' as const,
    receiptPrintLang: '' as string,
    mainDeviceToken: null as string | null,
  }
  if (!storeCode) {
    return NextResponse.json(defaultRes, { headers })
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
      card_auto_open?: boolean
      check_auto_open?: boolean
      drawer_open_option?: string
      logo_print?: boolean
      receipt_print_timing?: string
      customer_receipt_order_details?: boolean
      merchant_receipt_order_details?: boolean
      cash_payment_receipt?: boolean
      signature_line?: boolean
      receipt_barcode?: boolean
      item_barcode?: boolean
      qr_code_option?: string
      discount_separate_print?: boolean
      merchant_receipt_print?: boolean
      actual_order_details?: boolean
      topping_options_print?: boolean
      auto_print_receipt_on_order?: boolean
      auto_print_receipt_on_add_order?: boolean
      auto_print_receipt_on_payment?: boolean
      auto_print_kitchen_slip_on_order?: boolean
      receipt_biz_name?: string
      receipt_biz_tax_id?: string
      receipt_biz_owner?: string
      receipt_biz_address?: string
      receipt_biz_phone?: string
      receipt_design_style?: string
      receipt_logo_size?: string
      receipt_show_title?: boolean
      receipt_show_paid_stamp?: boolean
      receipt_show_thank_you?: boolean
      receipt_show_customer_copy?: boolean
      receipt_print_lang?: string
      vat_rate?: number
      vat_mode?: string
      service_rate?: number
      service_mode?: string
      card_rate?: number
      card_mode?: string
      card_base_mode?: string
      other_rate?: number
      other_mode?: string
      main_device_token?: string | null
    }[] | null

    const raw = rows?.[0]
    const kitchen1 = Array.isArray(raw?.kitchen1_categories)
      ? (raw.kitchen1_categories as string[]).filter((c) => typeof c === 'string')
      : []
    const kitchen2 = Array.isArray(raw?.kitchen2_categories)
      ? (raw.kitchen2_categories as string[]).filter((c) => typeof c === 'string')
      : []

    const fallback = await getStoreReceiptBizFallback(storeCode)

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
      cardAutoOpen: Boolean(raw?.card_auto_open),
      checkAutoOpen: Boolean(raw?.check_auto_open),
      drawerOpenOption: String(raw?.drawer_open_option || 'reason_only') === 'password_and_reason'
        ? 'password_and_reason'
        : String(raw?.drawer_open_option || 'reason_only') === 'force'
          ? 'force'
          : 'reason_only',
      logoPrint: Boolean(raw?.logo_print),
      receiptPrintTiming: String(raw?.receipt_print_timing || 'per_payment') === 'final_payment' ? 'final_payment' : 'per_payment',
      customerReceiptOrderDetails: raw?.customer_receipt_order_details !== false,
      merchantReceiptOrderDetails: raw?.merchant_receipt_order_details !== false,
      cashPaymentReceipt: Boolean(raw?.cash_payment_receipt),
      signatureLine: Boolean(raw?.signature_line),
      receiptBarcode: raw?.receipt_barcode !== false,
      itemBarcode: raw?.item_barcode !== false,
      qrCodeOption: String(raw?.qr_code_option || 'yes') === 'no'
        ? 'no'
        : String(raw?.qr_code_option || 'yes') === 'return_points'
          ? 'return_points'
          : 'yes',
      discountSeparatePrint: raw?.discount_separate_print !== false,
      merchantReceiptPrint: raw?.merchant_receipt_print !== false,
      actualOrderDetails: raw?.actual_order_details !== false,
      toppingOptionsPrint: Boolean(raw?.topping_options_print),
      autoPrintReceiptOnOrder: Boolean(raw?.auto_print_receipt_on_order),
      autoPrintReceiptOnAddOrder: Boolean(raw?.auto_print_receipt_on_add_order),
      autoPrintReceiptOnPayment: Boolean(raw?.auto_print_receipt_on_payment),
      autoPrintKitchenSlipOnOrder: Boolean(raw?.auto_print_kitchen_slip_on_order),
      receiptBizName: String(raw?.receipt_biz_name || '').trim() || fallback.receiptBizName,
      receiptBizTaxId: String(raw?.receipt_biz_tax_id || '').trim() || fallback.receiptBizTaxId,
      receiptBizOwner: String(raw?.receipt_biz_owner || '').trim() || fallback.receiptBizOwner,
      receiptBizAddress: String(raw?.receipt_biz_address || '').trim() || fallback.receiptBizAddress,
      receiptBizPhone: String(raw?.receipt_biz_phone || '').trim() || fallback.receiptBizPhone,
      receiptDesignStyle: String(raw?.receipt_design_style || 'badge') === 'simple' ? 'simple' : 'badge',
      receiptLogoSize:
        String(raw?.receipt_logo_size || 'md') === 'sm'
          ? 'sm'
          : String(raw?.receipt_logo_size || 'md') === 'lg'
            ? 'lg'
            : 'md',
      receiptShowTitle: raw?.receipt_show_title !== false,
      receiptShowPaidStamp: raw?.receipt_show_paid_stamp !== false,
      receiptShowThankYou: raw?.receipt_show_thank_you !== false,
      receiptShowCustomerCopy: raw?.receipt_show_customer_copy !== false,
      receiptPrintLang: String(raw?.receipt_print_lang ?? '').trim(),
      vatRate: Math.max(0, Number(raw?.vat_rate ?? 7)),
      vatMode: String(raw?.vat_mode || 'included') === 'separate' ? 'separate' : 'included',
      serviceRate: Math.max(0, Number(raw?.service_rate ?? 0)),
      serviceMode: String(raw?.service_mode || 'separate') === 'included' ? 'included' : 'separate',
      cardRate: Math.max(0, Number(raw?.card_rate ?? 0)),
      cardMode: String(raw?.card_mode || 'separate') === 'included' ? 'included' : 'separate',
      cardBaseMode:
        String(raw?.card_base_mode || 'card_only') === 'card_plus_vat'
          ? 'card_plus_vat'
          : String(raw?.card_base_mode || 'card_only') === 'card_plus_vat_service'
            ? 'card_plus_vat_service'
            : 'card_only',
      otherRate: Math.max(0, Number(raw?.other_rate ?? 0)),
      otherMode: String(raw?.other_mode || 'separate') === 'included' ? 'included' : 'separate',
    }, { headers })
  } catch (e) {
    console.error('getPosPrinterSettings:', e)
    return NextResponse.json(defaultRes, { headers })
  }
}
