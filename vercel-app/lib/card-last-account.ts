const LAST_CARD_ACCOUNT_KEY = 'cm_erp_last_card_account_id'

export function readLastCardAccountId(): string {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.localStorage.getItem(LAST_CARD_ACCOUNT_KEY) || '').trim()
  } catch {
    return ''
  }
}

export function writeLastCardAccountId(id: string): void {
  if (typeof window === 'undefined') return
  const v = String(id || '').trim()
  try {
    if (v) window.localStorage.setItem(LAST_CARD_ACCOUNT_KEY, v)
    else window.localStorage.removeItem(LAST_CARD_ACCOUNT_KEY)
  } catch {
    /* ignore quota */
  }
}
