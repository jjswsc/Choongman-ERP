import {
  INTERNAL_BANK_SOURCE_MARKER,
  extractWithdrawalCategoryFromNote,
} from '@/lib/bank-transaction-note-meta'
import { canLinkWithdrawForCardBill, memoLooksLikeCardBill } from '@/lib/card-bill-memo'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'

export type UnlinkedBankWithdrawalForCard = {
  id: number
  transDate: string
  amount: number
  memo: string
  likelyCardBill: boolean
}

export type BankWithdrawRowForCardLink = {
  id?: number
  trans_date?: string
  amount?: number
  memo?: string
  note?: string
  category?: string
}

export function resolvedWithdrawCategory(row: { category?: string; note?: string }): string {
  const cat = String(row.category || '').trim().toLowerCase()
  if (cat) return cat
  return String(extractWithdrawalCategoryFromNote(String(row.note || '')) || '').trim().toLowerCase()
}

export function filterUnlinkedBankWithdrawalsForCardRows(
  rows: BankWithdrawRowForCardLink[] | null | undefined,
  opts: { linkedIds: Set<number>; amount?: number | null }
): UnlinkedBankWithdrawalForCard[] {
  const linkedIds = opts.linkedIds
  const amount = opts.amount != null ? parseMoneyAmount(opts.amount) : null

  return (rows || [])
    .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    .filter((r) => canLinkWithdrawForCardBill(resolvedWithdrawCategory(r), String(r.memo || '')))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: parseMoneyAmount(r.amount),
        memo,
        likelyCardBill: memoLooksLikeCardBill(memo),
      }
    })
    .filter((r) => {
      if (!(r.id > 0 && r.amount > 0)) return false
      if (amount != null && amount > 0 && !moneyEqual(r.amount, amount)) return false
      return true
    })
    .sort((a, b) => {
      if (a.likelyCardBill !== b.likelyCardBill) return a.likelyCardBill ? -1 : 1
      if (a.transDate !== b.transDate) return a.transDate > b.transDate ? -1 : 1
      return b.id - a.id
    })
}
