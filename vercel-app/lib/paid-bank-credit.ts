/** 통장에서 이미 지급된 매입(PV)의 대변. 매입채무(2110) 대신 그 계좌. */

export const PAID_BANK_GL_CODE = '1010'
export const TRADE_PAYABLES_CODE = '2110'

export type PaidBankCreditView = {
  accountCode: string
  accountName: string
  amount: number
}

export function formatPaidBankAccountName(input: {
  name?: string | null
  bankName?: string | null
}): string {
  const name = String(input.name || '').trim()
  const bank = String(input.bankName || '').trim()
  if (bank && name && name.toLowerCase() !== bank.toLowerCase() && !name.includes(bank)) {
    return `${bank} · ${name}`
  }
  return name || bank
}

/** 매입채무 대변 합계가 통장 지급액과 같으면 그 줄을 지급 계좌로 바꾼다. */
export function linesWithPaidBankCredit<
  T extends { accountCode: string; accountName: string | null; credit: number },
>(lines: T[], paid: PaidBankCreditView | null): { lines: T[]; replaced: boolean } {
  if (!paid || !(Number(paid.amount) > 0)) return { lines, replaced: false }
  const accountCode = String(paid.accountCode || '').trim() || PAID_BANK_GL_CODE
  const accountName = String(paid.accountName || '').trim()
  if (!accountName) return { lines, replaced: false }
  const apCredit = lines.reduce((sum, ln) => {
    if (String(ln.accountCode || '').trim() !== TRADE_PAYABLES_CODE) return sum
    return sum + (Number(ln.credit) > 0 ? Number(ln.credit) : 0)
  }, 0)
  if (apCredit <= 0 || Math.abs(apCredit - Number(paid.amount)) > 0.02) {
    return { lines, replaced: false }
  }
  let replaced = false
  const next = lines.map((ln) => {
    if (!(Number(ln.credit) > 0) || String(ln.accountCode || '').trim() !== TRADE_PAYABLES_CODE) return ln
    replaced = true
    return { ...ln, accountCode, accountName }
  })
  return { lines: next, replaced }
}
