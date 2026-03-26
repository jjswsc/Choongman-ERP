import type { PosPrinterSettings } from "@/lib/api-client"

/** GET 응답(PosPrinterSettings)을 savePosPrinterSettings POST 본문으로 변환 */
export function posPrinterSettingsToSaveParams(s: PosPrinterSettings) {
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
    cardAutoOpen: Boolean(s.cardAutoOpen),
    checkAutoOpen: Boolean(s.checkAutoOpen),
    drawerOpenOption,
    logoPrint: Boolean(s.logoPrint),
    receiptPrintTiming: (String(s.receiptPrintTiming || "per_payment") === "final_payment"
      ? "final_payment"
      : "per_payment") as "per_payment" | "final_payment",
    customerReceiptOrderDetails: s.customerReceiptOrderDetails !== false,
    merchantReceiptOrderDetails: s.merchantReceiptOrderDetails !== false,
    cashPaymentReceipt: Boolean(s.cashPaymentReceipt),
    signatureLine: Boolean(s.signatureLine),
    receiptBarcode: s.receiptBarcode !== false,
    itemBarcode: s.itemBarcode !== false,
    qrCodeOption,
    discountSeparatePrint: s.discountSeparatePrint !== false,
    merchantReceiptPrint: s.merchantReceiptPrint !== false,
    actualOrderDetails: s.actualOrderDetails !== false,
    toppingOptionsPrint: Boolean(s.toppingOptionsPrint),
    autoPrintReceiptOnOrder: Boolean(s.autoPrintReceiptOnOrder),
    autoPrintReceiptOnAddOrder: Boolean(s.autoPrintReceiptOnAddOrder),
    autoPrintReceiptOnPayment: Boolean(s.autoPrintReceiptOnPayment),
    autoPrintKitchenSlipOnOrder: Boolean(s.autoPrintKitchenSlipOnOrder),
    receiptBizName: String(s.receiptBizName ?? "").trim(),
    receiptBizTaxId: String(s.receiptBizTaxId ?? "").trim(),
    receiptBizOwner: String(s.receiptBizOwner ?? "").trim(),
    receiptBizAddress: String(s.receiptBizAddress ?? "").trim(),
    receiptBizPhone: String(s.receiptBizPhone ?? "").trim(),
    receiptDesignStyle: (String(s.receiptDesignStyle || "badge") === "simple" ? "simple" : "badge") as "badge" | "simple",
    receiptLogoSize,
    receiptShowTitle: s.receiptShowTitle !== false,
    receiptShowPaidStamp: s.receiptShowPaidStamp !== false,
    receiptShowThankYou: s.receiptShowThankYou !== false,
    receiptShowCustomerCopy: s.receiptShowCustomerCopy !== false,
    receiptPrintLang: String(s.receiptPrintLang ?? "").trim() || undefined,
    vatRate: Math.max(0, Number(s.vatRate ?? 7)),
    vatMode: (String(s.vatMode || "included") === "separate" ? "separate" : "included") as "included" | "separate",
    serviceRate: Math.max(0, Number(s.serviceRate ?? 0)),
    serviceMode: (String(s.serviceMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
    cardRate: Math.max(0, Number(s.cardRate ?? 0)),
    cardMode: (String(s.cardMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
    cardBaseMode,
    otherRate: Math.max(0, Number(s.otherRate ?? 0)),
    otherMode: (String(s.otherMode || "separate") === "included" ? "included" : "separate") as "included" | "separate",
  }
}
