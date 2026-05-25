import type { PosPrinterSettings } from "@/lib/api-client"
import { normalizeKitchenRouteMapInput } from "@/lib/pos-kitchen-slip-routing"
import { normalizeKitchenOptionGroupKey } from "@/lib/pos-kitchen-slip-option-group-choices"

function normalizeKitchenSlipOptionGroupPrintMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeKitchenOptionGroupKey(k)
    if (!key) continue
    out[key] = v !== false
  }
  return out
}

export type PosPrinterSettingsToSaveParamsOptions = {
  /**
   * true: kitchenRoute* 필드를 본문에서 제외 → API가 해당 JSON 컬럼을 갱신하지 않음.
   * (프린터 탭 미저장 주방 라우트가 듀얼모니터·고객화면만 저장할 때 서버값으로 덮이는 것 방지)
   */
  omitKitchenRoutes?: boolean
}

const VALID_DISPLAY_LANG_CODES = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"] as const

/** GET 응답(PosPrinterSettings)을 savePosPrinterSettings POST 본문으로 변환 */
export function posPrinterSettingsToSaveParams(
  s: PosPrinterSettings,
  options?: PosPrinterSettingsToSaveParamsOptions
) {
  const km = Math.min(3, Math.max(1, Number(s.kitchenMode) || 1)) as 1 | 2 | 3
  const drawerOpt = String(s.drawerOpenOption || "reason_only")
  const drawerOpenOption = (["password_and_reason", "reason_only", "force"].includes(drawerOpt)
    ? drawerOpt
    : "reason_only") as "password_and_reason" | "reason_only" | "force"
  const qrOpt = String(s.qrCodeOption || "yes")
  const qrCodeOption = (["yes", "no", "return_points"].includes(qrOpt) ? qrOpt : "yes") as
    | "yes"
    | "no"
    | "return_points"
  const rawCardBaseMode = String(s.cardBaseMode || "card_only")
  const cardBaseMode = (
    rawCardBaseMode === "card_plus_vat"
      ? "card_plus_vat"
      : rawCardBaseMode === "card_plus_vat_service"
        ? "card_plus_vat_service"
        : "card_only"
  ) as "card_only" | "card_plus_vat" | "card_plus_vat_service"
  const fresh = Math.max(1, Number(s.cookingFreshMaxMin ?? 10))
  const warn = Math.max(fresh + 1, Number(s.cookingWarningMaxMin ?? 15))
  const recipeWarn = Math.max(0, Number(s.cookingRecipeWarningDiffMin ?? 0))
  const recipeUrgent = Math.max(recipeWarn + 1, Number(s.cookingRecipeUrgentDiffMin ?? 5))
  const receiptLogoSizeRaw = String(s.receiptLogoSize || "md")
  const receiptLogoSize = (receiptLogoSizeRaw === "sm" ? "sm" : receiptLogoSizeRaw === "lg" ? "lg" : "md") as
    | "sm"
    | "md"
    | "lg"
  const rawDisplayMonitorPreference = String(s.customerDisplayMonitorPreference || "secondary-first")
  const customerDisplayMonitorPreference = (
    rawDisplayMonitorPreference === "primary-only" ? "primary-only" : "secondary-first"
  ) as "secondary-first" | "primary-only"
  const rawDisplayLangOverride = String(s.customerDisplayLangOverride ?? "").trim()
  const customerDisplayLangOverride = (
    VALID_DISPLAY_LANG_CODES.includes(rawDisplayLangOverride as (typeof VALID_DISPLAY_LANG_CODES)[number])
      ? rawDisplayLangOverride
      : ""
  ) as "ko" | "en" | "th" | "mm" | "la" | "kh" | "vi" | "ms" | ""
  const customerDisplayLangMode = (
    String(s.customerDisplayLangMode || "follow-pos") === "custom" && customerDisplayLangOverride
      ? "custom"
      : "follow-pos"
  ) as "follow-pos" | "custom"
  const rawDisplayTheme = String(s.customerDisplayTheme || "dark")
  const customerDisplayTheme = (
    rawDisplayTheme === "light" ? "light" : rawDisplayTheme === "brand" ? "brand" : "dark"
  ) as "dark" | "light" | "brand"
  const rawDisplayDefaultState = String(s.customerDisplayDefaultState || "idle")
  const customerDisplayDefaultState = (
    rawDisplayDefaultState === "qr" ? "qr" : "idle"
  ) as "idle" | "qr"

  const omitKitchenRoutes = Boolean(options?.omitKitchenRoutes)

  return {
    storeCode: s.storeCode,
    kitchenMode: km,
    kitchen1Categories: Array.isArray(s.kitchen1Categories) ? s.kitchen1Categories : [],
    kitchen2Categories: Array.isArray(s.kitchen2Categories) ? s.kitchen2Categories : [],
    kitchen3Categories: Array.isArray(s.kitchen3Categories) ? s.kitchen3Categories : [],
    autoStockDeduction: Boolean(s.autoStockDeduction),
    deliveryFee: Math.max(0, Number(s.deliveryFee ?? 0)),
    packagingFee: Math.max(0, Number(s.packagingFee ?? 0)),
    cookingFreshMaxMin: fresh,
    cookingWarningMaxMin: warn,
    cookingRuleMode: (String(s.cookingRuleMode || "elapsed") === "recipe_diff" ? "recipe_diff" : "elapsed") as
      | "elapsed"
      | "recipe_diff",
    cookingRecipeWarningDiffMin: recipeWarn,
    cookingRecipeUrgentDiffMin: recipeUrgent,
    cookingDelayBadgeEnabled: s.cookingDelayBadgeEnabled !== false,
    cookingDelaySoundEnabled: Boolean(s.cookingDelaySoundEnabled),
    cookingDelayAlertOverMin: Math.max(0, Number(s.cookingDelayAlertOverMin ?? 0)),
    // 레거시 컬럼: 과거 카드/수표 자동 열기 — 정책상 비활성(항상 false)
    cardAutoOpen: false,
    checkAutoOpen: false,
    linkposSkipTerminalForCard: Boolean(s.linkposSkipTerminalForCard),
    drawerOpenOption,
    logoPrint: Boolean(s.logoPrint),
    receiptPrintTiming: (String(s.receiptPrintTiming || "per_payment") === "final_payment"
      ? "final_payment"
      : "per_payment") as "per_payment" | "final_payment",
    customerReceiptOrderDetails: s.customerReceiptOrderDetails !== false,
    merchantReceiptOrderDetails: s.merchantReceiptOrderDetails !== false,
    cashPaymentReceipt: Boolean(s.cashPaymentReceipt),
    signatureLine: Boolean(s.signatureLine),
    receiptBarcode: Boolean(s.receiptBarcode),
    itemBarcode: Boolean(s.itemBarcode),
    qrCodeOption,
    discountSeparatePrint: s.discountSeparatePrint !== false,
    merchantReceiptPrint: s.merchantReceiptPrint !== false,
    actualOrderDetails: s.actualOrderDetails !== false,
    toppingOptionsPrint: Boolean(s.toppingOptionsPrint),
    autoPrintReceiptOnOrder: Boolean(s.autoPrintReceiptOnOrder),
    autoPrintReceiptOnAddOrder: Boolean(s.autoPrintReceiptOnAddOrder),
    autoPrintReceiptOnPayment: Boolean(s.autoPrintReceiptOnPayment),
    autoPrintKitchenSlipOnOrder: Boolean(s.autoPrintKitchenSlipOnOrder),
    autoPrintFinalOrderBeforePayment: Boolean(s.autoPrintFinalOrderBeforePayment),
    receiptBizName: String(s.receiptBizName ?? "").trim(),
    receiptBizTaxId: String(s.receiptBizTaxId ?? "").trim(),
    receiptBizAbn: String(s.receiptBizAbn ?? "").trim(),
    receiptBizOwner: String(s.receiptBizOwner ?? "").trim(),
    receiptBizAddress: String(s.receiptBizAddress ?? "").trim(),
    receiptBizPhone: String(s.receiptBizPhone ?? "").trim(),
    receiptDesignStyle: (String(s.receiptDesignStyle || "badge") === "simple" ? "simple" : "badge") as "badge" | "simple",
    receiptLogoSize,
    receiptShowTitle: s.receiptShowTitle !== false,
    receiptShowPaidStamp: s.receiptShowPaidStamp !== false,
    receiptShowThankYou: s.receiptShowThankYou !== false,
    receiptShowCustomerCopy: s.receiptShowCustomerCopy !== false,
    receiptFooterPrimaryText: String(s.receiptFooterPrimaryText ?? "").trim(),
    receiptFooterSecondaryText: String(s.receiptFooterSecondaryText ?? "").trim(),
    receiptLogoImageUrl: String(s.receiptLogoImageUrl ?? "").trim(),
    receiptStampImageUrl: String(s.receiptStampImageUrl ?? "").trim(),
    receiptShowStamp: s.receiptShowStamp !== false,
    receiptStampOnlyTaxInvoice: s.receiptStampOnlyTaxInvoice !== false,
    receiptMembershipQrImageUrl: String(s.receiptMembershipQrImageUrl ?? "").trim(),
    receiptMembershipQrLinkUrl: String(s.receiptMembershipQrLinkUrl ?? "").trim(),
    receiptMembershipQrText: String(s.receiptMembershipQrText ?? "").trim(),
    receiptShowMembershipQr: Boolean(s.receiptShowMembershipQr),
    receiptPrintLang: String(s.receiptPrintLang ?? "").trim() || undefined,
    kitchenSlipPrintLang: String(s.kitchenSlipPrintLang ?? "").trim() || undefined,
    kitchenSlipFontScale: (String(s.kitchenSlipFontScale || "md").toLowerCase() === "sm"
      ? "sm"
      : String(s.kitchenSlipFontScale || "md").toLowerCase() === "lg"
        ? "lg"
        : "md") as "sm" | "md" | "lg",
    kitchenSlipShowLineNotes: s.kitchenSlipShowLineNotes !== false,
    kitchenSlipShowOrderMemo: s.kitchenSlipShowOrderMemo !== false,
    kitchenSlipOptionGroupPrint: normalizeKitchenSlipOptionGroupPrintMap(
      s.kitchenSlipOptionGroupPrint
    ),
    escPosCutAfterKitchenHtml: s.escPosCutAfterKitchenHtml !== false,
    escPosCutAfterHallOrderHtml: Boolean(s.escPosCutAfterHallOrderHtml),
    escPosCutAfterPaymentReceiptHtml: Boolean(s.escPosCutAfterPaymentReceiptHtml),
    vatRate: Math.max(0, Number(s.vatRate ?? 7)),
    vatMode: (String(s.vatMode || "included") === "separate" ? "separate" : "included") as "included" | "separate",
    serviceRate: Math.max(0, Number(s.serviceRate ?? 0)),
    serviceMode: (String(s.serviceMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
    cardRate: Math.max(0, Number(s.cardRate ?? 0)),
    cardMode: (String(s.cardMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
    cardBaseMode,
    otherRate: Math.max(0, Number(s.otherRate ?? 0)),
    otherMode: (String(s.otherMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
    dualMonitorEnabled: Boolean(s.dualMonitorEnabled),
    customerDisplayAutoOpen: s.customerDisplayAutoOpen !== false,
    customerDisplayMonitorPreference,
    customerDisplayLangMode,
    customerDisplayLangOverride: customerDisplayLangMode === "custom" ? customerDisplayLangOverride : undefined,
    customerDisplayTheme,
    customerDisplayDefaultState,
    customerDisplayIdleMessage: String(s.customerDisplayIdleMessage ?? "").trim(),
    customerDisplayPaymentMessage: String(s.customerDisplayPaymentMessage ?? "").trim(),
    customerDisplayQrPayload: String(s.customerDisplayQrPayload ?? "").trim(),
    customerDisplayShowOrderSummary: s.customerDisplayShowOrderSummary !== false,
    customerDisplayShowOrderTotal: s.customerDisplayShowOrderTotal !== false,
    customerDisplayIdleMediaType: ((): 'none' | 'image' | 'video' => {
      const t = String(s.customerDisplayIdleMediaType || 'none').toLowerCase()
      if (t === 'image' || t === 'video') return t
      return 'none'
    })(),
    customerDisplayIdleMediaUrl: String(s.customerDisplayIdleMediaUrl ?? '').trim(),
    ...(omitKitchenRoutes
      ? {}
      : {
          kitchenRouteByMenu: normalizeKitchenRouteMapInput(s.kitchenRouteByMenu),
          kitchenRouteByCategory: normalizeKitchenRouteMapInput(s.kitchenRouteByCategory),
          kitchenRouteByCategoryMain: normalizeKitchenRouteMapInput(s.kitchenRouteByCategoryMain),
        }),
  }
}
