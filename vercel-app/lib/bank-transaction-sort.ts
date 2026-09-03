/** 통장 원장 표시 순서: 거래일 오름차순(1일·2일이 월 목록 상단), 같은 날은 id. */
export type BankTransactionSortDir = 'asc' | 'desc'

export function bankTransactionDateKey(row: {
  transDate?: string | null
  trans_date?: string | null
}): string {
  return String(row.transDate || row.trans_date || '').slice(0, 10)
}

export function compareBankTransactionsByDate(
  a: { transDate?: string | null; trans_date?: string | null; id?: number | null },
  b: { transDate?: string | null; trans_date?: string | null; id?: number | null },
  dir: BankTransactionSortDir = 'asc'
): number {
  const mul = dir === 'desc' ? -1 : 1
  const d = bankTransactionDateKey(a).localeCompare(bankTransactionDateKey(b))
  if (d !== 0) return d * mul
  return (Number(a.id || 0) - Number(b.id || 0)) * mul
}

export function sortBankTransactionsByDate<
  T extends { transDate?: string | null; trans_date?: string | null; id?: number | null },
>(rows: T[], dir: BankTransactionSortDir = 'asc'): T[] {
  return [...rows].sort((a, b) => compareBankTransactionsByDate(a, b, dir))
}
