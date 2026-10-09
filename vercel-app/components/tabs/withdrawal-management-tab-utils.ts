import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { isOfficeStore } from "@/lib/permissions"
import { CANONICAL_OFFICE_STORE, canonicalOfficeStore } from "@/lib/office-store-canonical"

export { processExpenseAttachmentFiles } from "@/lib/expense-document-upload"

export function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

const IGNORED_STORE_OPTION_VALUES = new Set(["store", "매장명"])

export function isSelectableStoreOption(value: unknown): value is string {
  const raw = String(value || "").trim()
  if (!raw) return false
  return !IGNORED_STORE_OPTION_VALUES.has(raw.toLowerCase())
}

export type TransferKind = "bank_to_petty" | "bank_to_card" | "bank_general"

export function withdrawalCategoryFromTransferKind(kind: TransferKind): "transfer_to_petty" | "bank_card_bill" | "transfer" {
  if (kind === "bank_to_card") return "bank_card_bill"
  if (kind === "bank_to_petty") return "transfer_to_petty"
  return "transfer"
}

export function transferKindFromWithdrawalCategory(cat: string): TransferKind {
  const c = String(cat || "").trim().toLowerCase()
  if (c === "bank_card_bill") return "bank_to_card"
  if (c === "transfer_to_petty") return "bank_to_petty"
  return "bank_general"
}

export function isTransferPrepaymentKind(kind: TransferKind): boolean {
  return kind === "bank_to_petty" || kind === "bank_to_card"
}

/** 계정과목 선택란을 쓰는 유형 — 전환 시 기존 값을 지우면 고정자산 자동선택과 충돌해 React #185가 난다. */
export function categoryUsesAccountSubjectPicker(
  categoryMain: string,
  transferKind?: string
): boolean {
  if (categoryMain === "expense" || categoryMain === "fixed_asset" || categoryMain === "purchase") return true
  if (categoryMain === "transfer" && transferKind === "bank_general") return true
  return false
}

export const CATEGORY_MAIN_OPTIONS = [
  { value: "purchase", labelKey: "wm_purchase", sub: ["normal", "advance"] },
  { value: "expense", labelKey: "wm_expense", sub: ["normal", "advance"] },
  { value: "fixed_asset", labelKey: "wm_fixed_asset", sub: [] },
  { value: "transfer", labelKey: "wm_transfer", sub: [] },
  { value: "tax", labelKey: "wm_tax", sub: ["vat", "withholding", "corporate", "sso"] },
  { value: "loan", labelKey: "wm_loan", sub: ["repayment", "given"] },
  { value: "correction", labelKey: "wm_correction", sub: [] },
  { value: "dividend", labelKey: "wm_dividend", sub: [] },
] as const

export const DELIVERY_APP_FEE_PRESETS = [
  { id: "grab", code: "GRAB_FEE", name: "Grab", memo: "Delivery App fee - Grab" },
  { id: "lineman", code: "LINEMAN_FEE", name: "Line-man", memo: "Delivery App fee - Line-man" },
  { id: "shopee", code: "SHOPEE_FEE", name: "Shopee", memo: "Delivery App fee - Shopee" },
  { id: "robinhood", code: "ROBINHOOD_FEE", name: "Robinhood", memo: "Delivery App fee - Robinhood" },
] as const

export const CARD_FEE_PRESETS = [
  { id: "card", code: "CARD_FEE", nameKey: "wm_cardFeeLabel", name: "Card Fee", memo: "Card fee" },
  {
    id: "card_installment",
    code: "CARD_INSTALLMENT_FEE",
    nameKey: "wm_cardInstallmentFeeLabel",
    name: "Card Installment Fee",
    memo: "Card installment fee",
  },
] as const

export function resolveMonthEndDate(month: string): string | null {
  const src = String(month || "").trim()
  if (!/^\d{4}-\d{2}$/.test(src)) return null
  const [yRaw, mRaw] = src.split("-")
  const year = Number(yRaw)
  const monthNum = Number(mRaw)
  if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null
  const last = new Date(year, monthNum, 0).getDate()
  return `${src}-${String(last).padStart(2, "0")}`
}

export type WithdrawalVendorOption = {
  code: string
  name: string
  bankAccountNo?: string | null
  bankName?: string | null
  taxId?: string
  address?: string
}

export type QuickAddVendorSeed = {
  name: string
  taxId: string
  bankName: string
  bankAccountNo: string
}

export function mapCategoryToMainSub(catRaw: string): { main: string; sub: string } {
  const c = String(catRaw || "").trim().toLowerCase()
  if (c === "purchase_payment") return { main: "purchase", sub: "normal" }
  if (c === "purchase_advance") return { main: "purchase", sub: "advance" }
  if (c === "expense") return { main: "expense", sub: "normal" }
  if (c === "expense_advance") return { main: "expense", sub: "advance" }
  if (c === "fixed_asset") return { main: "fixed_asset", sub: "" }
  if (c === "bank_card_bill" || c === "transfer_to_petty") return { main: "transfer", sub: "" }
  if (c === "transfer" || c.startsWith("transfer_")) return { main: "transfer", sub: "" }
  if (c === "loan_repayment") return { main: "loan", sub: "repayment" }
  if (c === "loan_given") return { main: "loan", sub: "given" }
  if (c === "tax_vat") return { main: "tax", sub: "vat" }
  if (c === "tax_withholding") return { main: "tax", sub: "withholding" }
  if (c === "tax_corporate") return { main: "tax", sub: "corporate" }
  if (c === "tax_sso") return { main: "tax", sub: "sso" }
  if (c === "tax") return { main: "tax", sub: "withholding" }
  if (c === "correction") return { main: "correction", sub: "" }
  if (c === "dividend") return { main: "dividend", sub: "" }
  return { main: "expense", sub: "normal" }
}

export function resolveWithdrawalCategory(main: string, sub: string): string {
  if (main === "purchase") return sub === "advance" ? "purchase_advance" : "purchase_payment"
  if (main === "expense") return sub === "advance" ? "expense_advance" : "expense"
  if (main === "fixed_asset") return "fixed_asset"
  if (main === "transfer") return "transfer"
  if (main === "loan") return sub === "given" ? "loan_given" : "loan_repayment"
  if (main === "tax") {
    if (sub === "vat") return "tax_vat"
    if (sub === "corporate") return "tax_corporate"
    if (sub === "sso") return "tax_sso"
    return "tax_withholding"
  }
  if (main === "correction") return "correction"
  if (main === "dividend") return "dividend"
  return "expense"
}

export function pickOfficeStore(list: string[]): string {
  if (list.length === 0) return ""
  if (list.includes(CANONICAL_OFFICE_STORE)) return CANONICAL_OFFICE_STORE
  const office = list.find((s) => isOfficeStore(s))
  return office ? canonicalOfficeStore(office) : list[0]
}

export function resolveStoreInList(name: string, list: string[]): string {
  const n = String(name || "").trim()
  if (!n) return ""
  if (list.includes(n)) return n
  const fuzzy = list.find((s) => storesMatchForGradeLookup(s, n))
  return fuzzy || n
}

export type WithdrawalManagementTabProps = {
  /** 지출 발생(지급 예정) 저장 후 상위에서 지급예정 탭·기간 동기화 */
  onAccrualSaved?: (opts: { expenseDate: string }) => void
  /** 월별 수수료 일괄 등록 후 상위에서 지출 검색 탭·해당 월 기간 동기화 */
  onBatchWithdrawalSaved?: (opts: { startStr: string; endStr: string }) => void
}
