/** 통장 계좌 선택·목록 표시 — 은행명·계좌번호(전체)·매장 */

export const BANK_ACCOUNT_HQ_STORE_LABEL = 'HQ'

/** bank_accounts.store — 본사·Office 등 본사 계열 */
export function isBankAccountOfficeStore(store: string | null | undefined): boolean {
  const x = String(store || '').trim().toLowerCase()
  if (!x) return false
  return (
    x === '본사' ||
    x === 'office' ||
    x === '오피스' ||
    x === '본점' ||
    x === 'cm office' ||
    x === 'hq' ||
    x.includes('office')
  )
}

/** 화면 표시 — 본사 계열은 HQ로 통일 */
export function displayBankAccountStore(store: string | null | undefined): string {
  const s = String(store || '').trim()
  if (!s) return ''
  return isBankAccountOfficeStore(s) ? BANK_ACCOUNT_HQ_STORE_LABEL : s
}

/** 저장·폼 값 — 본사 계열은 HQ로 통일 */
export function canonicalBankAccountStore(store: string | null | undefined): string {
  const s = String(store || '').trim()
  if (!s) return ''
  return isBankAccountOfficeStore(s) ? BANK_ACCOUNT_HQ_STORE_LABEL : s
}

export function bankAccountStoreKeysMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const norm = (v: string | null | undefined) => {
    const s = String(v || '').trim()
    if (!s) return ''
    return isBankAccountOfficeStore(s) ? BANK_ACCOUNT_HQ_STORE_LABEL.toLowerCase() : s.toLowerCase()
  }
  return norm(a) === norm(b)
}

export function formatBankAccountLabel(account: {
  id?: number
  name?: string
  bankName?: string
  store?: string
}): string {
  const name = String(account.name || '').trim()
  const bankName = String(account.bankName || '').trim()
  const storeLabel = displayBankAccountStore(account.store)
  const head = [bankName ? `[${bankName}]` : '', name || (account.id ? `#${account.id}` : '')]
    .filter(Boolean)
    .join(' ')
  return storeLabel ? `${head} · ${storeLabel}` : head || '—'
}
