export type BankAttentionReason = "unclassified" | "no_subject"

export type BankAttentionRow = {
  transType?: string
  category?: string
  accountSubjectId?: number | null
}

export type BankAttentionEdits = {
  category?: string
  accountSubjectId?: string
}

const DEPOSIT_CATEGORIES_NEED_SUBJECT = new Set([
  "revenue_delivery",
  "revenue_card",
  "revenue_qr",
  "revenue_cash",
  "expense",
])

const WITHDRAW_CATEGORIES_NEED_SUBJECT = new Set(["expense", "purchase_payment"])

export function resolveBankRowCategory(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): string {
  const fallback =
    row.transType === "deposit" ? "receivable_receive" : "expense"
  const raw = String(edits?.category ?? row.category ?? fallback).toLowerCase()
  if (row.transType === "withdraw" && raw === "fixed") return "expense"
  return raw
}

export function resolveBankRowAccountSubjectId(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): number | null {
  if (edits?.accountSubjectId !== undefined) {
    if (!edits.accountSubjectId || edits.accountSubjectId === "__none__") return null
    const n = Number(edits.accountSubjectId)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const n = Number(row.accountSubjectId ?? 0)
  return n > 0 ? n : null
}

export function bankRowNeedsAttention(
  row: BankAttentionRow,
  edits?: BankAttentionEdits
): { needsAttention: boolean; reason: BankAttentionReason | null } {
  const cat = resolveBankRowCategory(row, edits)
  if (cat === "unclassified" || !cat) {
    return { needsAttention: true, reason: "unclassified" }
  }

  const needsSubject =
    row.transType === "deposit"
      ? DEPOSIT_CATEGORIES_NEED_SUBJECT.has(cat)
      : WITHDRAW_CATEGORIES_NEED_SUBJECT.has(cat)

  if (needsSubject && resolveBankRowAccountSubjectId(row, edits) == null) {
    return { needsAttention: true, reason: "no_subject" }
  }

  return { needsAttention: false, reason: null }
}

export function countBankAttentionRows(
  rows: BankAttentionRow[],
  editsById?: Record<number, BankAttentionEdits>,
  rowId?: (row: BankAttentionRow, index: number) => number | undefined
): { unclassified: number; noSubject: number; total: number } {
  let unclassified = 0
  let noSubject = 0
  rows.forEach((row, i) => {
    const id = rowId?.(row, i)
    const edits = id != null ? editsById?.[id] : undefined
    const { needsAttention, reason } = bankRowNeedsAttention(row, edits)
    if (!needsAttention) return
    if (reason === "unclassified") unclassified += 1
    else if (reason === "no_subject") noSubject += 1
  })
  return { unclassified, noSubject, total: unclassified + noSubject }
}
