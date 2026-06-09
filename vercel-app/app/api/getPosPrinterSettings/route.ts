import { NextRequest, NextResponse } from 'next/server'
import { normalizeKitchenOptionGroupKey } from '@/lib/pos-kitchen-slip-option-group-choices'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { listMainDeviceTokensForStore } from '@/lib/pos-main-devices-server'
import { parsePosDeviceRoleLimitsRow } from '@/lib/pos-device-role-limits'
import { parseKitchenRouteMapDb, alignKitchenCategoryRouteKeyMap } from '@/lib/pos-kitchen-slip-routing'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'

type VendorBizInfo = {
  name?: string
  tax_id?: string
  ceo?: string
  addr?: string
  phone?: string
}

function normalizeKitchenSlipOptionGroupPrintMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeKitchenOptionGroupKey(k)
    if (!key) continue
    out[key] = v !== false
  }
  return out
}

async function getStoreReceiptBizFallback(storeCode: string): Promise<{
  receiptBizName: string
  receiptBizTaxId: string
  receiptBizAbn: string
  receiptBizOwner: string
  receiptBizAddress: string
  receiptBizPhone: string
}> {
  const s = String(storeCode || '').trim()
  if (!s) {
    return {
      receiptBizName: '',
      receiptBizTaxId: '',
      receiptBizAbn: '',
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
    receiptBizAbn: '',
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
  const authResult = await requireAuth(request, 'any')
  if (!authResult.auth) {
    return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
  }
  const requestedStoreCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const authStore = String(authResult.auth.store || '').trim()
  const office = isOfficeRole(authResult.auth.role || '')
  const storeCode = office ? requestedStoreCode : requestedStoreCode || authStore
  if (!office && storeCode && authStore && storeCode !== authStore) {
    return NextResponse.json({ success: false, message: '다른 매장 설정에는 접근할 수 없습니다.' }, { status: 403, headers })
  }

  const defaultRes = {
    kitchenMode: 1,
    kitchen1Categories: [] as string[],
    kitchen2Categories: [] as string[],
    kitchen3Categories: [] as string[],
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
    linkposSkipTerminalForCard: true,
    drawerOpenOption: 'reason_only' as const,
    logoPrint: false,
    receiptPrintTiming: 'per_payment' as const,
    customerReceiptOrderDetails: true,
    merchantReceiptOrderDetails: true,
    cashPaymentReceipt: false,
    signatureLine: false,
    receiptBarcode: false,
    itemBarcode: false,
    qrCodeOption: 'yes' as const,
    discountSeparatePrint: true,
    merchantReceiptPrint: true,
    actualOrderDetails: true,
    toppingOptionsPrint: false,
    autoPrintReceiptOnOrder: false,
    autoPrintReceiptOnAddOrder: false,
    autoPrintReceiptOnPayment: false,
    autoPrintKitchenSlipOnOrder: false,
    autoPrintFinalOrderBeforePayment: false,
    receiptBizName: '',
    receiptBizTaxId: '',
    receiptBizAbn: '',
    receiptBizOwner: '',
    receiptBizAddress: '',
    receiptBizPhone: '',
    receiptDesignStyle: 'badge' as const,
    receiptLogoSize: 'md' as const,
    receiptShowTitle: true,
    receiptShowPaidStamp: true,
    receiptShowThankYou: true,
    receiptShowCustomerCopy: true,
    receiptFooterPrimaryText: '',
    receiptFooterSecondaryText: '',
    receiptLogoImageUrl: '',
    receiptStampImageUrl: '',
    receiptShowStamp: true,
    receiptStampOnlyTaxInvoice: true,
    receiptMembershipQrImageUrl: '',
    receiptMembershipQrLinkUrl: '',
    receiptMembershipQrText: '',
    receiptShowMembershipQr: false,
    kitchenSlipFontScale: 'md' as const,
    kitchenSlipShowLineNotes: true,
    kitchenSlipShowOrderMemo: true,
    kitchenSlipOptionGroupPrint: {} as Record<string, boolean>,
    escPosCutAfterKitchenHtml: true,
    /** DB·런타임 미설정 시 true: 같은 프린터로 거의 동시에 두 기기가 찍으면 컷 없이 한 롤로 이어붙는 사례 방지 */
    escPosCutAfterHallOrderHtml: true,
    escPosCutAfterPaymentReceiptHtml: true,
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
    kitchenSlipPrintLang: '' as string,
    mainDeviceToken: null as string | null,
    mainDeviceTokens: [] as string[],
    mainDeviceMaxCount: 1,
    orderDeviceMaxCount: 8,
    mainDeviceRoleLocked: false,
    kitchenRouteByMenu: {} as Record<string, 0 | 1 | 2 | 3>,
    kitchenRouteByCategory: {} as Record<string, 0 | 1 | 2 | 3>,
    kitchenRouteByCategoryMain: {} as Record<string, 0 | 1 | 2 | 3>,
    dualMonitorEnabled: false,
    customerDisplayAutoOpen: true,
    customerDisplayMonitorPreference: 'secondary-first' as const,
    customerDisplayLangMode: 'follow-pos' as const,
    customerDisplayLangOverride: '' as string,
    customerDisplayTheme: 'dark' as const,
    customerDisplayDefaultState: 'idle' as const,
    customerDisplayIdleMessage: '',
    customerDisplayPaymentMessage: '',
    customerDisplayQrPayload: '',
    customerDisplayShowOrderSummary: true,
    customerDisplayShowOrderTotal: true,
    customerDisplayIdleMediaType: 'none' as const,
    customerDisplayIdleMediaUrl: '',
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
      linkpos_skip_terminal_for_card?: boolean
      drawer_open_option?: string
      drawer_pin_hash?: string | null
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
      auto_print_final_order_before_payment?: boolean
      receipt_biz_name?: string
      receipt_biz_tax_id?: string
      receipt_biz_abn?: string
      receipt_biz_owner?: string
      receipt_biz_address?: string
      receipt_biz_phone?: string
      receipt_design_style?: string
      receipt_logo_size?: string
      receipt_show_title?: boolean
      receipt_show_paid_stamp?: boolean
      receipt_show_thank_you?: boolean
      receipt_show_customer_copy?: boolean
      receipt_footer_primary_text?: string
      receipt_footer_secondary_text?: string
      receipt_logo_image_url?: string
      receipt_stamp_image_url?: string
      receipt_show_stamp?: boolean
      receipt_stamp_only_tax_invoice?: boolean
      receipt_membership_qr_image_url?: string
      receipt_membership_qr_link_url?: string
      receipt_membership_qr_text?: string
      receipt_show_membership_qr?: boolean
      kitchen_slip_font_scale?: string
      kitchen_slip_show_line_notes?: boolean
      kitchen_slip_show_order_memo?: boolean
      kitchen_slip_option_group_print?: unknown
      esc_pos_cut_after_kitchen_html?: boolean
      esc_pos_cut_after_hall_order_html?: boolean
      esc_pos_cut_after_payment_receipt_html?: boolean
      receipt_print_lang?: string
      kitchen_slip_print_lang?: string
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
      main_device_max_count?: unknown
      order_device_max_count?: unknown
      main_device_role_locked?: unknown
      kitchen3_categories?: unknown
      kitchen_route_by_menu?: unknown
      kitchen_route_by_category?: unknown
      kitchen_route_by_category_main?: unknown
      dual_monitor_enabled?: boolean
      customer_display_auto_open?: boolean
      customer_display_monitor_preference?: string
      customer_display_lang_mode?: string
      customer_display_lang_override?: string
      customer_display_theme?: string
      customer_display_default_state?: string
      customer_display_idle_message?: string
      customer_display_payment_message?: string
      customer_display_qr_payload?: string
      customer_display_show_order_summary?: boolean
      customer_display_show_order_total?: boolean
      customer_display_idle_media_type?: string
      customer_display_idle_media_url?: string
    }[] | null

    const raw = rows?.[0]
    const rawKitchenOptionGroupPrint = normalizeKitchenSlipOptionGroupPrintMap(
      raw?.kitchen_slip_option_group_print
    )
    const kitchen1 = Array.isArray(raw?.kitchen1_categories)
      ? (raw.kitchen1_categories as string[]).filter((c) => typeof c === 'string')
      : []
    const kitchen2 = Array.isArray(raw?.kitchen2_categories)
      ? (raw.kitchen2_categories as string[]).filter((c) => typeof c === 'string')
      : []
    const kitchen3 = Array.isArray(raw?.kitchen3_categories)
      ? (raw.kitchen3_categories as string[]).filter((c) => typeof c === 'string')
      : []

    const fallback = await getStoreReceiptBizFallback(storeCode)

    const fromConnected = await listMainDeviceTokensForStore(storeCode)
    const legacy =
      raw?.main_device_token != null && String(raw.main_device_token).trim()
        ? String(raw.main_device_token).trim()
        : null
    const mainDeviceTokens =
      fromConnected.length > 0 ? fromConnected : legacy ? [legacy] : []
    const mainDeviceTokenResolved = mainDeviceTokens[0] ?? null
    const deviceRoleLimits = parsePosDeviceRoleLimitsRow(raw)

    return NextResponse.json({
      storeCode,
      kitchenMode: Math.min(3, Math.max(1, Number(raw?.kitchen_mode) || 1)),
      kitchen1Categories: kitchen1.filter((c) => typeof c === 'string'),
      kitchen2Categories: kitchen2.filter((c) => typeof c === 'string'),
      kitchen3Categories: kitchen3.filter((c) => typeof c === 'string'),
      autoStockDeduction: Boolean(raw?.auto_stock_deduction),
      deliveryFee: Math.max(0, Number(raw?.delivery_fee ?? 0)),
      packagingFee: Math.max(0, Number(raw?.packaging_fee ?? 0)),
      cookingFreshMaxMin: Math.max(1, Number(raw?.cooking_fresh_max_min ?? 10)),
      cookingWarningMaxMin: Math.max(2, Number(raw?.cooking_warning_max_min ?? 15)),
      cookingRuleMode: String(raw?.cooking_rule_mode || 'elapsed') === 'recipe_diff' ? 'recipe_diff' : 'elapsed',
      cookingRecipeWarningDiffMin: Math.max(0, Number(raw?.cooking_recipe_warning_diff_min ?? 0)),
      cookingRecipeUrgentDiffMin: Math.max(1, Number(raw?.cooking_recipe_urgent_diff_min ?? 5)),
      cookingDelayBadgeEnabled:
        raw?.cooking_delay_badge_enabled === false
          ? false
          : raw?.cooking_delay_badge_enabled === true
            ? true
            : true,
      cookingDelaySoundEnabled: Boolean(raw?.cooking_delay_sound_enabled),
      cookingDelayAlertOverMin: Math.max(0, Number(raw?.cooking_delay_alert_over_min ?? 0)),
      // 레거시 컬럼: 과거 카드/수표 자동 열기 — 정책상 비활성(클라이언트엔 항상 false)
      cardAutoOpen: false,
      checkAutoOpen: false,
      /** DB에 명시적으로 false만 단말 연동. null/미컬럼/누락 행은 수동(생략) 기본 */
      linkposSkipTerminalForCard: raw?.linkpos_skip_terminal_for_card !== false,
      drawerOpenOption: String(raw?.drawer_open_option || 'reason_only') === 'password_and_reason'
        ? 'password_and_reason'
        : String(raw?.drawer_open_option || 'reason_only') === 'force'
          ? 'force'
          : 'reason_only',
      drawerPinConfigured: Boolean(String(raw?.drawer_pin_hash ?? '').trim()),
      logoPrint: Boolean(raw?.logo_print),
      receiptPrintTiming: String(raw?.receipt_print_timing || 'per_payment') === 'final_payment' ? 'final_payment' : 'per_payment',
      customerReceiptOrderDetails: raw?.customer_receipt_order_details !== false,
      merchantReceiptOrderDetails: raw?.merchant_receipt_order_details !== false,
      cashPaymentReceipt: Boolean(raw?.cash_payment_receipt),
      signatureLine: Boolean(raw?.signature_line),
      receiptBarcode: Boolean(raw?.receipt_barcode),
      itemBarcode: Boolean(raw?.item_barcode),
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
      autoPrintFinalOrderBeforePayment: Boolean(raw?.auto_print_final_order_before_payment),
      receiptBizName: String(raw?.receipt_biz_name || '').trim() || fallback.receiptBizName,
      receiptBizTaxId: String(raw?.receipt_biz_tax_id || '').trim() || fallback.receiptBizTaxId,
      receiptBizAbn: String(raw?.receipt_biz_abn || '').trim() || fallback.receiptBizAbn,
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
      receiptFooterPrimaryText: String(raw?.receipt_footer_primary_text ?? '').trim(),
      receiptFooterSecondaryText: String(raw?.receipt_footer_secondary_text ?? '').trim(),
      receiptLogoImageUrl: String(raw?.receipt_logo_image_url ?? '').trim(),
      receiptStampImageUrl: String(raw?.receipt_stamp_image_url ?? '').trim(),
      receiptShowStamp: raw?.receipt_show_stamp !== false,
      receiptStampOnlyTaxInvoice: raw?.receipt_stamp_only_tax_invoice !== false,
      receiptMembershipQrImageUrl: String(raw?.receipt_membership_qr_image_url ?? '').trim(),
      receiptMembershipQrLinkUrl: String(raw?.receipt_membership_qr_link_url ?? '').trim(),
      receiptMembershipQrText: String(raw?.receipt_membership_qr_text ?? '').trim(),
      receiptShowMembershipQr: Boolean(raw?.receipt_show_membership_qr),
      kitchenSlipFontScale:
        String(raw?.kitchen_slip_font_scale || 'md').toLowerCase() === 'sm'
          ? 'sm'
          : String(raw?.kitchen_slip_font_scale || 'md').toLowerCase() === 'lg'
            ? 'lg'
            : 'md',
      kitchenSlipShowLineNotes: raw?.kitchen_slip_show_line_notes !== false,
      kitchenSlipShowOrderMemo: raw?.kitchen_slip_show_order_memo !== false,
      kitchenSlipOptionGroupPrint: rawKitchenOptionGroupPrint,
      escPosCutAfterKitchenHtml:
        raw?.esc_pos_cut_after_kitchen_html === false
          ? false
          : raw?.esc_pos_cut_after_kitchen_html === true
            ? true
            : true,
      escPosCutAfterHallOrderHtml:
        raw?.esc_pos_cut_after_hall_order_html === false
          ? false
          : raw?.esc_pos_cut_after_hall_order_html === true
            ? true
            : true,
      escPosCutAfterPaymentReceiptHtml:
        raw?.esc_pos_cut_after_payment_receipt_html === false
          ? false
          : raw?.esc_pos_cut_after_payment_receipt_html === true
            ? true
            : true,
      receiptPrintLang: String(raw?.receipt_print_lang ?? '').trim(),
      kitchenSlipPrintLang: String(raw?.kitchen_slip_print_lang ?? '').trim(),
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
      mainDeviceTokens,
      mainDeviceToken: mainDeviceTokenResolved,
      mainDeviceMaxCount: deviceRoleLimits.mainDeviceMaxCount,
      orderDeviceMaxCount: deviceRoleLimits.orderDeviceMaxCount,
      mainDeviceRoleLocked: deviceRoleLimits.mainDeviceRoleLocked,
      kitchenRouteByMenu: parseKitchenRouteMapDb(raw?.kitchen_route_by_menu),
      kitchenRouteByCategory: alignKitchenCategoryRouteKeyMap(
        parseKitchenRouteMapDb(raw?.kitchen_route_by_category)
      ),
      kitchenRouteByCategoryMain: alignKitchenCategoryRouteKeyMap(
        parseKitchenRouteMapDb(raw?.kitchen_route_by_category_main)
      ),
      dualMonitorEnabled: Boolean(raw?.dual_monitor_enabled),
      customerDisplayAutoOpen: raw?.customer_display_auto_open !== false,
      customerDisplayMonitorPreference:
        String(raw?.customer_display_monitor_preference || 'secondary-first') === 'primary-only'
          ? 'primary-only'
          : 'secondary-first',
      customerDisplayLangMode:
        String(raw?.customer_display_lang_mode || 'follow-pos') === 'custom' &&
        ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms'].includes(
          String(raw?.customer_display_lang_override || '').trim()
        )
          ? 'custom'
          : 'follow-pos',
      customerDisplayLangOverride: ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms'].includes(
        String(raw?.customer_display_lang_override || '').trim()
      )
        ? String(raw?.customer_display_lang_override || '').trim()
        : '',
      customerDisplayTheme:
        String(raw?.customer_display_theme || 'dark') === 'light'
          ? 'light'
          : String(raw?.customer_display_theme || 'dark') === 'brand'
            ? 'brand'
            : 'dark',
      customerDisplayDefaultState:
        String(raw?.customer_display_default_state || 'idle') === 'qr' ? 'qr' : 'idle',
      customerDisplayIdleMessage: String(raw?.customer_display_idle_message ?? '').trim(),
      customerDisplayPaymentMessage: String(raw?.customer_display_payment_message ?? '').trim(),
      customerDisplayQrPayload: String(raw?.customer_display_qr_payload ?? '').trim(),
      customerDisplayShowOrderSummary: raw?.customer_display_show_order_summary !== false,
      customerDisplayShowOrderTotal: raw?.customer_display_show_order_total !== false,
      customerDisplayIdleMediaType: (() => {
        const t = String(raw?.customer_display_idle_media_type || 'none').toLowerCase()
        if (t === 'image' || t === 'video') return t
        return 'none' as const
      })(),
      customerDisplayIdleMediaUrl: String(raw?.customer_display_idle_media_url ?? '').trim(),
    }, { headers })
  } catch (e) {
    console.error('getPosPrinterSettings:', e)
    return NextResponse.json(defaultRes, { headers })
  }
}
