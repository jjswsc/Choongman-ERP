/** 통장 계좌 선택·목록 표시 — 은행명·계좌번호(전체)·매장 */

import {
  CANONICAL_OFFICE_STORE,
  canonicalOfficeStore,
  isOfficeStoreVariant,
} from '@/lib/office-store-canonical'

/** @deprecated CANONICAL_OFFICE_STORE 사용 — 하위 호환용 별칭 */
export const BANK_ACCOUNT_HQ_STORE_LABEL = CANONICAL_OFFICE_STORE

/** bank_accounts.store — 본사·Office 등 본사 계열 */
export function isBankAccountOfficeStore(store: string | null | undefined): boolean {
  return isOfficeStoreVariant(store)
}

/** 화면 표시 — 본사 계열은 CM Office로 통일 */
export function displayBankAccountStore(store: string | null | undefined): string {
  return canonicalOfficeStore(store)
}

/** 저장·폼 값 — 본사 계열은 CM Office로 통일 */
export function canonicalBankAccountStore(store: string | null | undefined): string {
  return canonicalOfficeStore(store)
}

export function bankAccountStoreKeysMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const norm = (v: string | null | undefined) => canonicalOfficeStore(v).toLowerCase()
  return norm(a) === norm(b)
}

/** 지출·지급 시 매장명에 맞는 통장 계좌 (본사 계열 Office 통일 매칭) */
export function findBankAccountForStore<T extends { id?: number; store?: string | null }>(
  accounts: T[],
  storeName: string | null | undefined
): T | undefined {
  const want = String(storeName || '').trim()
  if (!want || !accounts.length) return undefined
  return accounts.find((a) => bankAccountStoreKeysMatch(a.store, want))
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
