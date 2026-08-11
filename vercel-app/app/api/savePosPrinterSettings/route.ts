import { NextRequest, NextResponse } from 'next/server'
import { normalizeKitchenOptionGroupKey } from '@/lib/pos-kitchen-slip-option-group-choices'
import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsertMerge,
} from '@/lib/supabase-server'
import { normalizeKitchenRouteMapInput } from '@/lib/pos-kitchen-slip-routing'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import { requireAuth } from '@/lib/verify-auth'
import { canAccessPosPrinters, canSavePosCustomerDisplayFields, hasOfficeStaffScope } from '@/lib/permissions'
import { canAccessPosStoreForAuth } from '@/lib/pos-store-access-server'
import { normalizeFeeStackMode, normalizeFeeStackOrder, normalizePaymentTotalRoundingMode } from '@/lib/pos-pricing'
import {
  normalizeMembershipQrImageUrlForStorage,
  normalizeMembershipQrLinkUrlForStorage,
} from '@/lib/pos-membership-qr-defaults'
import { LINKPOS_FORCE_MANUAL_CARD, isLinkposCardApiEnabled } from '@/lib/linkpos-card-api-enabled'

/** POS 주문/결산 직원 등: 고객 화면·듀얼 모니터 컬럼만 갱신 (나머지는 DB 기존값 유지) */
const CUSTOMER_DISPLAY_ONLY_DB_KEYS = new Set([
  'dual_monitor_enabled',
  'customer_display_auto_open',
  'customer_display_monitor_preference',
  'customer_display_lang_mode',
  'customer_display_lang_override',
  'customer_display_theme',
  'customer_display_default_state',
  'customer_display_idle_message',
  'customer_display_payment_message',
  'customer_display_qr_payload',
  'customer_display_show_order_summary',
  'customer_display_show_order_total',
  'customer_display_idle_media_type',
  'customer_display_idle_media_url',
  'updated_at',
])

/** JSON 본문에서 true/false 문자열 등도 안전하게 해석 (지연 배지 등) */
function parseBoolParam(v: unknown, defaultVal: boolean): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  if (v === false || v === 'false' || v === 0 || v === '0') return false
  return defaultVal
}

function parseLayoutMmParam(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

function parseCookingInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : fallback
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

function extractMissingColumnName(error: unknown): string | null {
  const msg = String(error ?? '')
  const m = msg.match(/Could not find the '([^']+)' column/i)
  return m?.[1] || null
}

async function upsertWithMissingColumnFallback(storeCode: string, patch: Record<string, unknown>) {
  const workingPatch: Record<string, unknown> = { ...patch }
  const skipped: string[] = []
  // PGRST204: 컬럼 1개씩 제거 후 재시도. 상한 = patch 키 수(스키마 갭이 커도 존재하는 컬럼은 저장)
  const maxRetries = Math.max(40, Object.keys(workingPatch).length + 5)

  for (let i = 0; i < maxRetries; i++) {
    try {
      await supabaseUpsertMerge('pos_printer_settings', 'store_code', {
        store_code: storeCode,
        ...workingPatch,
      })
      if (skipped.length > 0) {
        console.warn(
          `savePosPrinterSettings: skipped ${skipped.length} missing column(s): ${skipped.join(', ')}`
        )
      }
      return
    } catch (e) {
      const missingCol = extractMissingColumnName(e)
      if (!missingCol) throw e
      if (!(missingCol in workingPatch)) throw e
      delete workingPatch[missingCol]
      skipped.push(missingCol)
      console.warn(`savePosPrinterSettings: skip missing column '${missingCol}'`)
    }
  }
  throw new Error(
    `savePosPrinterSettings: too many missing-column retries (${skipped.length}). ` +
      `Omni DB에 pos_printer_settings 컬럼이 부족합니다. ` +
      `sql/omni_pos_printer_settings_full_columns.sql 실행 후 다시 저장하세요. ` +
      `skipped: ${skipped.slice(0, 12).join(', ')}${skipped.length > 12 ? '…' : ''}`
  )
}

/**
 * 대분류/카테고리/메뉴별 라우팅 선택을 pos_menus.kitchen_printer로 실체화.
 * 최종 우선순위는 main -> category -> menu.
 */
async function materializeKitchenPrintersToMenus(params: {
  routeByMenu: Record<string, 0 | 1 | 2 | 3>
  routeByCategory: Record<string, 0 | 1 | 2 | 3>
  routeByCategoryMain: Record<string, 0 | 1 | 2 | 3>
}) {
  const rows = (await supabaseSelect('pos_menus', {
    select: 'id,code,category,category_main,kitchen_printer',
    limit: 10000,
  })) as
    | {
        id?: number | string
        code?: string
        category?: string
        category_main?: string
        kitchen_printer?: number | null
      }[]
    | null
  const menus = Array.isArray(rows) ? rows : []
  if (!menus.length) return

  const mapMenu = params.routeByMenu || {}
  const routeByCode: Record<string, 0 | 1 | 2 | 3> = {}
  const idByCode = new Map<string, string>()
  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    const code = String(m.code ?? '').trim().toLowerCase()
    if (id && code) idByCode.set(id, code)
  }
  for (const [id, route] of Object.entries(mapMenu)) {
    const code = idByCode.get(id)
    if (code) routeByCode[code] = route
  }
  const mapCatRaw = params.routeByCategory || {}
  const mapMainRaw = params.routeByCategoryMain || {}
  const mapCat: Record<string, 0 | 1 | 2 | 3> = {}
  const mapMain: Record<string, 0 | 1 | 2 | 3> = {}
  for (const [k, v] of Object.entries(mapCatRaw)) {
    const key = normalizePromotionCategoryMain(String(k).trim())
    if (key) mapCat[key] = v
  }
  for (const [k, v] of Object.entries(mapMainRaw)) {
    const key = normalizePromotionCategoryMain(String(k).trim())
    if (key) mapMain[key] = v
  }

  for (const m of menus) {
    const id = String(m.id ?? '').trim()
    if (!id) continue
    const cat = normalizePromotionCategoryMain(String(m.category ?? '').trim())
    const main = normalizePromotionCategoryMain(String(m.category_main ?? '').trim())
    const prev =
      m.kitchen_printer === 0 || m.kitchen_printer === 1 || m.kitchen_printer === 2 || m.kitchen_printer === 3
        ? (m.kitchen_printer as 0 | 1 | 2 | 3)
        : null
    let next: 0 | 1 | 2 | 3 = prev ?? 1
    if (main && mapMain[main] !== undefined) next = mapMain[main]
    if (cat && mapCat[cat] !== undefined) next = mapCat[cat]
    const code = String(m.code ?? '').trim().toLowerCase()
    if (code && routeByCode[code] !== undefined) next = routeByCode[code]
    if (mapMenu[id] !== undefined) next = mapMenu[id]
    if (prev === next) continue
    await supabaseUpdateByFilter('pos_menus', `id=eq.${encodeURIComponent(id)}`, {
      kitchen_printer: next,
    })
  }
}

/** POS 프린터 설정 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'any')
    if (!authResult.auth) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
    }
    const actorRole = String(authResult.auth.role || '')
    const authStore = String(authResult.auth.store || '').trim()
    const allowFullPrinterSave = canAccessPosPrinters(actorRole, authStore)
    const allowCustomerDisplayOnly = !allowFullPrinterSave && canSavePosCustomerDisplayFields(actorRole)
    if (!allowFullPrinterSave && !allowCustomerDisplayOnly) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }
    const body = await req.json()
    const requestedStoreCode = String(body?.storeCode ?? '').trim()
    const office = hasOfficeStaffScope(actorRole, authStore)
    const storeCode = office ? requestedStoreCode : requestedStoreCode || authStore
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
    // 레거시 필드: 과거 카드/수표 자동 열기 — 정책상 비활성(요청값과 무관하게 false)
    const cardAutoOpen = false
    const checkAutoOpen = false
    const linkposSkipTerminalForCard = LINKPOS_FORCE_MANUAL_CARD
      ? true
      : parseBoolParam(body?.linkposSkipTerminalForCard, !isLinkposCardApiEnabled())
    const kbankMerchantId = String(body?.kbankMerchantId ?? '').trim()
    const kbankPartnerShopId = String(body?.kbankPartnerShopId ?? '').trim()
    const kbankTerminalId = String(body?.kbankTerminalId ?? '').trim()
    const kbankSkipApiForQr = parseBoolParam(body?.kbankSkipApiForQr, true)
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
    const autoPrintFinalOrderBeforePayment = Boolean(body?.autoPrintFinalOrderBeforePayment)
    // 미전송 시: 주방 주문 자동인쇄와 동일. 명시 false만 OFF (DEFAULT false로 덮어쓰지 않음)
    const autoPrintKitchenSlipOnCancel =
      typeof body?.autoPrintKitchenSlipOnCancel === 'boolean'
        ? body.autoPrintKitchenSlipOnCancel
        : autoPrintKitchenSlipOnOrder
    const autoPrintCheckBillOnCancel = body?.autoPrintCheckBillOnCancel !== false
    const receiptBizName = String(body?.receiptBizName ?? '').trim()
    const receiptBizTaxId = String(body?.receiptBizTaxId ?? '').trim()
    const receiptBizAbn = String(body?.receiptBizAbn ?? '').trim()
    const receiptBizOwner = String(body?.receiptBizOwner ?? '').trim()
    const receiptBizAddress = String(body?.receiptBizAddress ?? '').trim()
    const receiptBizPhone = String(body?.receiptBizPhone ?? '').trim()
    const receiptShowBizAddress = Boolean(body?.receiptShowBizAddress)
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
    const receiptMembershipQrImageUrlRaw = String(body?.receiptMembershipQrImageUrl ?? '').trim()
    const receiptMembershipQrImageUrl = receiptMembershipQrImageUrlRaw
      ? normalizeMembershipQrImageUrlForStorage(receiptMembershipQrImageUrlRaw)
      : ''
    const receiptMembershipQrLinkUrlRaw = String(body?.receiptMembershipQrLinkUrl ?? '').trim()
    const receiptMembershipQrLinkUrl = receiptMembershipQrLinkUrlRaw
      ? normalizeMembershipQrLinkUrlForStorage(receiptMembershipQrLinkUrlRaw)
      : ''
    const receiptMembershipQrText = String(body?.receiptMembershipQrText ?? '').trim()
    const receiptShowMembershipQr = Boolean(body?.receiptShowMembershipQr)
    const kitchenSlipScaleRaw = String(body?.kitchenSlipFontScale || 'md').toLowerCase()
    const kitchenSlipFontScale = kitchenSlipScaleRaw === 'sm' ? 'sm' : kitchenSlipScaleRaw === 'lg' ? 'lg' : 'md'
    const kitchenSlipShowLineNotes = body?.kitchenSlipShowLineNotes !== false
    const kitchenSlipShowOrderMemo = body?.kitchenSlipShowOrderMemo !== false
    const kitchenSlipOptionGroupPrint = normalizeKitchenSlipOptionGroupPrintMap(
      body?.kitchenSlipOptionGroupPrint
    )
    const escPosCutAfterKitchenHtml = parseBoolParam(body?.escPosCutAfterKitchenHtml, true)
    const escPosCutAfterHallOrderHtml = parseBoolParam(body?.escPosCutAfterHallOrderHtml, true)
    const escPosCutAfterPaymentReceiptHtml = parseBoolParam(body?.escPosCutAfterPaymentReceiptHtml, true)
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
    const feeStackMode = normalizeFeeStackMode(body?.feeStackMode)
    const feeStackOrder = normalizeFeeStackOrder(body?.feeStackOrder)
    const paymentTotalRoundingMode = normalizePaymentTotalRoundingMode(
      body?.paymentTotalRoundingMode,
      body?.roundPaymentTotalToWholeBaht
    )
    const dualMonitorEnabled = Boolean(body?.dualMonitorEnabled)
    const customerDisplayAutoOpen = body?.customerDisplayAutoOpen !== false
    const rawDisplayMonitorPreference = String(body?.customerDisplayMonitorPreference || 'secondary-first')
    const customerDisplayMonitorPreference =
      rawDisplayMonitorPreference === 'primary-only' ? 'primary-only' : 'secondary-first'
    const validPrintLangs = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']
    const customerDisplayLangOverrideRaw = String(body?.customerDisplayLangOverride ?? '').trim()
    const customerDisplayLangOverride =
      customerDisplayLangOverrideRaw && validPrintLangs.includes(customerDisplayLangOverrideRaw)
        ? customerDisplayLangOverrideRaw
        : ''
    const customerDisplayLangMode =
      String(body?.customerDisplayLangMode || 'follow-pos') === 'custom' && customerDisplayLangOverride
        ? 'custom'
        : 'follow-pos'
    const rawDisplayTheme = String(body?.customerDisplayTheme || 'dark')
    const customerDisplayTheme =
      rawDisplayTheme === 'light' ? 'light' : rawDisplayTheme === 'brand' ? 'brand' : 'dark'
    const customerDisplayDefaultState = String(body?.customerDisplayDefaultState || 'idle') === 'qr' ? 'qr' : 'idle'
    const customerDisplayIdleMessage = String(body?.customerDisplayIdleMessage ?? '').trim()
    const customerDisplayPaymentMessage = String(body?.customerDisplayPaymentMessage ?? '').trim()
    const customerDisplayQrPayload = String(body?.customerDisplayQrPayload ?? '').trim()
    const customerDisplayShowOrderSummary = body?.customerDisplayShowOrderSummary !== false
    const customerDisplayShowOrderTotal = body?.customerDisplayShowOrderTotal !== false
    const rawIdleMediaType = String(body?.customerDisplayIdleMediaType || 'none').toLowerCase()
    const customerDisplayIdleMediaType =
      rawIdleMediaType === 'image' ? 'image' : rawIdleMediaType === 'video' ? 'video' : 'none'
    const customerDisplayIdleMediaUrl = String(body?.customerDisplayIdleMediaUrl ?? '').trim().slice(0, 2048)
    const receiptPrintLangRaw = String(body?.receiptPrintLang ?? '').trim()
    const receiptPrintLang = receiptPrintLangRaw && validPrintLangs.includes(receiptPrintLangRaw) ? receiptPrintLangRaw : ''
    const kitchenSlipPrintLangRaw = String(body?.kitchenSlipPrintLang ?? '').trim()
    const kitchenSlipPrintLang =
      kitchenSlipPrintLangRaw && validPrintLangs.includes(kitchenSlipPrintLangRaw) ? kitchenSlipPrintLangRaw : ''
    const receiptInsetLeftMm = parseLayoutMmParam(body?.receiptInsetLeftMm)
    const receiptInsetRightMm = parseLayoutMmParam(body?.receiptInsetRightMm)
    const receiptContentNudgeLeftMm = parseLayoutMmParam(body?.receiptContentNudgeLeftMm)
    const kitchenSlipPaddingLeftMm = parseLayoutMmParam(body?.kitchenSlipPaddingLeftMm)
    const kitchenSlipPaddingRightMm = parseLayoutMmParam(body?.kitchenSlipPaddingRightMm)

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
    if (!office && authStore) {
      const allowed = await canAccessPosStoreForAuth(authStore, storeCode)
      if (!allowed) {
        return NextResponse.json({ success: false, message: '다른 매장 설정을 수정할 수 없습니다.' }, { status: 403, headers })
      }
    }
    const previousRows = (await supabaseSelectFilter(
      'pos_printer_settings',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as Record<string, unknown>[] | null
    const previous = previousRows?.[0] || {}

    /** 본문에 없으면 DB 기존값 유지. 컬럼/행 없으면 true(충만 기본). */
    const requireGuestCount =
      body?.requireGuestCount !== undefined
        ? parseBoolParam(body.requireGuestCount, true)
        : previous.require_guest_count !== false

    if (allowCustomerDisplayOnly && !previousRows?.length) {
      return NextResponse.json(
        {
          success: false,
          message:
            '매장 프린터 기본 설정이 없습니다. 관리자 화면(/admin/pos-printers)에서 한 번 저장한 뒤 POS 설정 → 듀얼 모니터에서 고객 화면을 설정할 수 있습니다.',
        },
        { status: 403, headers }
      )
    }

    if (
      allowFullPrinterSave &&
      (routeMenuPatch !== undefined || routeCatPatch !== undefined || routeMainPatch !== undefined)
    ) {
      try {
        await materializeKitchenPrintersToMenus({
          routeByMenu: routeMenuPatch || {},
          routeByCategory: routeCatPatch || {},
          routeByCategoryMain: routeMainPatch || {},
        })
      } catch (menuSyncErr) {
        const msg = String(menuSyncErr ?? '')
        if (msg.includes('kitchen_printer') || msg.includes('42703')) {
          console.warn('savePosPrinterSettings: skip menu kitchen_printer materialize (column missing)')
        } else {
          throw menuSyncErr
        }
      }
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
      linkpos_skip_terminal_for_card: linkposSkipTerminalForCard,
      kbank_skip_api_for_qr: kbankSkipApiForQr,
      kbank_merchant_id: kbankMerchantId || null,
      kbank_partner_shop_id: kbankPartnerShopId || null,
      kbank_terminal_id: kbankTerminalId || null,
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
      auto_print_final_order_before_payment: autoPrintFinalOrderBeforePayment,
      auto_print_kitchen_slip_on_cancel: autoPrintKitchenSlipOnCancel,
      auto_print_check_bill_on_cancel: autoPrintCheckBillOnCancel,
      receipt_biz_name: receiptBizName,
      receipt_biz_tax_id: receiptBizTaxId,
      receipt_biz_abn: receiptBizAbn,
      receipt_biz_owner: receiptBizOwner,
      receipt_biz_address: receiptBizAddress,
      receipt_biz_phone: receiptBizPhone,
      receipt_show_biz_address: receiptShowBizAddress,
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
      kitchen_slip_option_group_print: kitchenSlipOptionGroupPrint,
      receipt_inset_left_mm: receiptInsetLeftMm,
      receipt_inset_right_mm: receiptInsetRightMm,
      receipt_content_nudge_left_mm: receiptContentNudgeLeftMm,
      kitchen_slip_padding_left_mm: kitchenSlipPaddingLeftMm,
      kitchen_slip_padding_right_mm: kitchenSlipPaddingRightMm,
      esc_pos_cut_after_kitchen_html: escPosCutAfterKitchenHtml,
      esc_pos_cut_after_hall_order_html: escPosCutAfterHallOrderHtml,
      esc_pos_cut_after_payment_receipt_html: escPosCutAfterPaymentReceiptHtml,
      receipt_print_lang: receiptPrintLang,
      kitchen_slip_print_lang: kitchenSlipPrintLang,
      vat_rate: vatRate,
      vat_mode: vatMode,
      service_rate: serviceRate,
      service_mode: serviceMode,
      card_rate: cardRate,
      card_mode: cardMode,
      card_base_mode: cardBaseMode,
      other_rate: otherRate,
      other_mode: otherMode,
      fee_stack_mode: feeStackMode,
      fee_stack_order: feeStackOrder,
      payment_total_rounding_mode: paymentTotalRoundingMode,
      require_guest_count: requireGuestCount,
      dual_monitor_enabled: dualMonitorEnabled,
      customer_display_auto_open: customerDisplayAutoOpen,
      customer_display_monitor_preference: customerDisplayMonitorPreference,
      customer_display_lang_mode: customerDisplayLangMode,
      customer_display_lang_override: customerDisplayLangOverride,
      customer_display_theme: customerDisplayTheme,
      customer_display_default_state: customerDisplayDefaultState,
      customer_display_idle_message: customerDisplayIdleMessage,
      customer_display_payment_message: customerDisplayPaymentMessage,
      customer_display_qr_payload: customerDisplayQrPayload,
      customer_display_show_order_summary: customerDisplayShowOrderSummary,
      customer_display_show_order_total: customerDisplayShowOrderTotal,
      customer_display_idle_media_type: customerDisplayIdleMediaType,
      customer_display_idle_media_url: customerDisplayIdleMediaUrl,
      updated_at: new Date().toISOString(),
      ...(routeMenuPatch !== undefined ? { kitchen_route_by_menu: routeMenuPatch } : {}),
      ...(routeCatPatch !== undefined ? { kitchen_route_by_category: routeCatPatch } : {}),
      ...(routeMainPatch !== undefined ? { kitchen_route_by_category_main: routeMainPatch } : {}),
    }

    if (allowCustomerDisplayOnly) {
      for (const key of Object.keys(patch)) {
        if (CUSTOMER_DISPLAY_ONLY_DB_KEYS.has(key)) continue
        if (Object.prototype.hasOwnProperty.call(previous, key)) {
          ;(patch as Record<string, unknown>)[key] = previous[key]
        }
      }
    }

    await upsertWithMissingColumnFallback(storeCode, patch)
    try {
      const changedKeys = Object.keys(patch).filter((key) => {
        if (key === 'updated_at') return false
        const prevVal = previous[key]
        const nextVal = patch[key as keyof typeof patch]
        return JSON.stringify(prevVal ?? null) !== JSON.stringify(nextVal ?? null)
      })
      if (changedKeys.length > 0) {
        await supabaseInsert('pos_printer_settings_audit_logs', {
          store_code: storeCode,
          changed_at: new Date().toISOString(),
          changed_by: String(authResult.auth.name || '').trim() || null,
          changed_role: String(authResult.auth.role || '').trim() || null,
          changed_keys_json: JSON.stringify(changedKeys),
          before_json: JSON.stringify(previous),
          after_json: JSON.stringify(patch),
        })
      }
    } catch (auditErr) {
      console.warn('savePosPrinterSettings audit skipped:', auditErr)
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
