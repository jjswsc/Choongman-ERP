import { compressImageForUpload } from "@/lib/utils"

export function todayStrBkk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

async function fileToAccrualAttachmentDataUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    return compressImageForUpload(file, 1200, 0.65)
  }
  const max = 1.5 * 1024 * 1024
  if (file.size > max) {
    throw new Error("FILE_TOO_LARGE")
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ""))
    r.onerror = () => reject(new Error("read_fail"))
    r.readAsDataURL(file)
  })
}

export async function processExpenseAttachmentFiles(
  files: File[]
): Promise<{ attachmentUrls: string[]; invoicePhotoUrl?: string }> {
  const urls: string[] = []
  let invoicePhotoUrl: string | undefined
  for (const f of files.slice(0, 3)) {
    const url = await fileToAccrualAttachmentDataUrl(f)
    urls.push(url)
    if (!invoicePhotoUrl && f.type.startsWith("image/")) {
      invoicePhotoUrl = url
    }
  }
  return { attachmentUrls: urls, invoicePhotoUrl }
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

export const CATEGORY_MAIN_OPTIONS = [
  { value: "purchase", labelKey: "wm_purchase", sub: ["normal", "advance"] },
  { value: "expense", labelKey: "wm_expense", sub: ["normal", "advance"] },
  { value: "fixed_asset", labelKey: "wm_fixed_asset", sub: [] },
  { value: "transfer", labelKey: "wm_transfer", sub: [] },
  { value: "tax", labelKey: "wm_tax", sub: ["vat", "withholding"] },
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

export type WithdrawalManagementTabProps = {
  /** 지출 발생(지급 예정) 저장 후 상위에서 지급예정 탭·기간 동기화 */
  onAccrualSaved?: (opts: { expenseDate: string }) => void
  /** 월별 수수료 일괄 등록 후 상위에서 지출 검색 탭·해당 월 기간 동기화 */
  onBatchWithdrawalSaved?: (opts: { startStr: string; endStr: string }) => void
}
