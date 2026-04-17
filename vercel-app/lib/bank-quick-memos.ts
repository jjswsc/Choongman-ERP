/**
 * 통장 화면「자주 쓰는 메모」칩 목록 — 브라우저 localStorage (기기·브라우저별)
 */
export const BANK_QUICK_MEMO_DEFAULTS: readonly string[] = [
  'Shopee Sales',
  'Grab Sales',
  'Cash Deposit',
  'store sales QR',
]

const STORAGE_KEY = 'cm-erp-bank-quick-memos-v1'

export function loadBankQuickMemos(): string[] {
  if (typeof window === 'undefined') return [...BANK_QUICK_MEMO_DEFAULTS]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...BANK_QUICK_MEMO_DEFAULTS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...BANK_QUICK_MEMO_DEFAULTS]
    const cleaned = parsed
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
    return cleaned.length > 0 ? cleaned : [...BANK_QUICK_MEMO_DEFAULTS]
  } catch {
    return [...BANK_QUICK_MEMO_DEFAULTS]
  }
}

export function saveBankQuickMemos(phrases: string[]): void {
  if (typeof window === 'undefined') return
  const cleaned = phrases.map((x) => x.trim()).filter(Boolean)
  if (cleaned.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
}

export function resetBankQuickMemosStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
