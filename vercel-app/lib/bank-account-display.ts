/** 통장 계좌 선택·목록 표시 — 은행명·계좌번호(전체)·매장 */

export function formatBankAccountLabel(account: {
  id?: number
  name?: string
  bankName?: string
  store?: string
}): string {
  const name = String(account.name || '').trim()
  const bankName = String(account.bankName || '').trim()
  const store = String(account.store || '').trim()
  const head = [bankName ? `[${bankName}]` : '', name || (account.id ? `#${account.id}` : '')]
    .filter(Boolean)
    .join(' ')
  return store ? `${head} · ${store}` : head || '—'
}
