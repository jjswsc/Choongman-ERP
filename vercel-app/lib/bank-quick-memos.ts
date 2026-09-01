/**
 * 통장 화면「자주 쓰는 메모」칩 목록 — 브라우저 localStorage (기기·브라우저별)
 */
export const BANK_QUICK_MEMO_DEFAULTS: readonly string[] = [
  'Shopee Sales',
  'Grab Sales',
  'Line man sales',
  'Credit Card Sales',
  'store sales QR',
  'Cash Deposit',
  'Sale Old Oil',
]

const STORAGE_KEY = 'cm-erp-bank-quick-memos-v2'
const LEGACY_STORAGE_KEY = 'cm-erp-bank-quick-memos-v1'

export function mergeBankQuickMemoDefaults(saved: string[]): string[] {
  const have = new Set(saved.map((s) => s.toLowerCase()))
  const extra = BANK_QUICK_MEMO_DEFAULTS.filter((phrase) => !have.has(phrase.toLowerCase()))
  return extra.length ? [...saved, ...extra] : saved
}

function parsePhraseList(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const cleaned = parsed
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
    return cleaned.length > 0 ? cleaned : null
  } catch {
    return null
  }
}

export function loadBankQuickMemos(): string[] {
  if (typeof window === 'undefined') return [...BANK_QUICK_MEMO_DEFAULTS]
  try {
    const current = parsePhraseList(localStorage.getItem(STORAGE_KEY))
    if (current) return mergeBankQuickMemoDefaults(current)
    const legacy = parsePhraseList(localStorage.getItem(LEGACY_STORAGE_KEY))
    if (legacy) {
      const merged = mergeBankQuickMemoDefaults(legacy)
      saveBankQuickMemos(merged)
      return merged
    }
    return [...BANK_QUICK_MEMO_DEFAULTS]
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
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}
