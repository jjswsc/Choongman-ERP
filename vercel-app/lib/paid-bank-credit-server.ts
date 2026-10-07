import { assertAccountingDateOpen } from '@/lib/accounting-posting'
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { isExpenseInternalBankNote } from '@/lib/bank-transaction-note-meta'
import {
  formatPaidBankAccountName,
  PAID_BANK_GL_CODE,
  TRADE_PAYABLES_CODE,
  type PaidBankCreditView,
} from '@/lib/paid-bank-credit'
import { TAX_BOOK } from '@/lib/tax-book'
import { assertTaxAccountingPeriodOpen } from '@/lib/tax-book-period-server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

type PayablePayRow = {
  id?: number
  amount?: number | null
  bank_transaction_id?: number | null
}

type BankTxRow = {
  id?: number
  account_id?: number | null
  note?: string | null
}

type BankAccountRow = {
  id?: number
  name?: string | null
  bank_name?: string | null
}

type JournalHead = {
  id?: number
  book?: string | null
  tax_entity_code?: string | null
  accounting_date?: string | null
  store_name?: string | null
}

type JournalLineRow = {
  journal_entry_id?: number
  account_code?: string | null
  side?: string | null
  amount?: number | string | null
}

export async function journalCreditForBankAccount(accountId: number): Promise<{
  accountCode: string
  accountName: string
}> {
  const fallback = accountLine(PAID_BANK_GL_CODE)
  const id = Math.floor(Number(accountId) || 0)
  if (id <= 0) return fallback
  try {
    const rows = (await supabaseSelectFilter('bank_accounts', `id=eq.${id}`, {
      select: 'id,name,bank_name',
      limit: 1,
    })) as BankAccountRow[] | null
    const label = formatPaidBankAccountName({
      name: rows?.[0]?.name,
      bankName: rows?.[0]?.bank_name,
    })
    if (!label) return fallback
    return accountLine(PAID_BANK_GL_CODE, { nameKo: label })
  } catch (e) {
    console.warn('journalCreditForBankAccount:', e)
    return fallback
  }
}

export type PaidBankCredit = PaidBankCreditView & {
  bankTransactionIds: number[]
}

/** 지출 발생이 실통장 출금으로 지급됐으면 그 계좌. 여러 계좌로 나뉘면 null. */
export async function loadPaidBankCreditForExpenseAccrual(accrualId: number): Promise<PaidBankCredit | null> {
  const id = Math.floor(Number(accrualId) || 0)
  if (id <= 0) return null
  const pays = (await supabaseSelectFilter(
    'payable_transactions',
    `expense_accrual_id=eq.${id}&ref_type=eq.Payment`,
    { select: 'id,amount,bank_transaction_id', limit: 50 }
  )) as PayablePayRow[] | null
  const bankIds = [
    ...new Set(
      (pays || [])
        .filter((row) => Number(row.amount || 0) < 0 && Number(row.bank_transaction_id || 0) > 0)
        .map((row) => Number(row.bank_transaction_id))
    ),
  ]
  if (!bankIds.length) return null
  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=in.(${bankIds.join(',')})`, {
    select: 'id,account_id,note',
    limit: bankIds.length,
  })) as BankTxRow[] | null
  const real = (bankRows || []).filter((row) => !isExpenseInternalBankNote(row.note))
  const accountIds = [...new Set(real.map((row) => Number(row.account_id || 0)).filter((n) => n > 0))]
  if (accountIds.length !== 1) return null
  const accountId = accountIds[0]
  const paidBankIds = new Set(
    real.filter((row) => Number(row.account_id || 0) === accountId).map((row) => Number(row.id || 0))
  )
  const amount = (pays || []).reduce((sum, row) => {
    const bankId = Number(row.bank_transaction_id || 0)
    if (!paidBankIds.has(bankId) || !(Number(row.amount || 0) < 0)) return sum
    return sum + Math.abs(Number(row.amount) || 0)
  }, 0)
  if (amount <= 0) return null
  const credit = await journalCreditForBankAccount(accountId)
  if (!credit.accountName || credit.accountName === credit.accountCode) return null
  return {
    accountCode: credit.accountCode,
    accountName: credit.accountName,
    amount,
    bankTransactionIds: [...paidBankIds].filter((n) => n > 0),
  }
}

function isPayableCashSettlement(lines: JournalLineRow[]): boolean {
  if (lines.length < 2) return false
  let debitAp = 0
  let creditCash = 0
  for (const ln of lines) {
    const code = String(ln.account_code || '').trim()
    const side = String(ln.side || '').toLowerCase()
    const amt = Math.abs(Number(ln.amount) || 0)
    if (amt <= 0) continue
    if (side === 'debit' && code === TRADE_PAYABLES_CODE) debitAp += amt
    else if (side === 'credit' && code === PAID_BANK_GL_CODE) creditCash += amt
    else return false
  }
  return debitAp > 0 && Math.abs(debitAp - creditCash) <= 0.02
}

/**
 * 매입채무 차변 / 현금 대변으로만 된 지급 분개.
 * scope tax 는 세무 장부만, all 은 경영 장부까지.
 */
export async function deletePayableSettlementJournals(
  bankTransactionId: number,
  scope: 'tax' | 'all',
  taxEntityCode?: string | null
): Promise<{ deleted: number; skippedClosed: boolean }> {
  const bankId = Math.floor(Number(bankTransactionId) || 0)
  if (bankId <= 0) return { deleted: 0, skippedClosed: false }
  const heads = (await supabaseSelectFilter(
    'journal_entries',
    `source_type=eq.bank_transaction&source_id=eq.${bankId}`,
    { select: 'id,book,tax_entity_code,accounting_date,store_name', limit: 40 }
  )) as JournalHead[] | null
  const entity = String(taxEntityCode || '').trim()
  const targets = (heads || []).filter((head) => {
    const id = Number(head.id || 0)
    if (id <= 0) return false
    const book = String(head.book || '').trim()
    if (scope === 'tax') {
      return book === TAX_BOOK && (!entity || String(head.tax_entity_code || '').trim() === entity)
    }
    return true
  })
  if (!targets.length) return { deleted: 0, skippedClosed: false }
  const idList = targets.map((h) => Number(h.id)).join(',')
  const lines = (await supabaseSelectFilter('journal_lines', `journal_entry_id=in.(${idList})`, {
    select: 'journal_entry_id,account_code,side,amount',
    limit: 400,
  })) as JournalLineRow[] | null
  const byEntry = new Map<number, JournalLineRow[]>()
  for (const ln of lines || []) {
    const entryId = Number(ln.journal_entry_id || 0)
    if (entryId <= 0) continue
    const bucket = byEntry.get(entryId) || []
    bucket.push(ln)
    byEntry.set(entryId, bucket)
  }
  let deleted = 0
  let skippedClosed = false
  for (const head of targets) {
    const entryId = Number(head.id || 0)
    if (!isPayableCashSettlement(byEntry.get(entryId) || [])) continue
    const ymd = String(head.accounting_date || '').slice(0, 10)
    const month = ymd.slice(0, 7)
    try {
      if (String(head.book || '').trim() === TAX_BOOK) {
        await assertTaxAccountingPeriodOpen(String(head.tax_entity_code || entity), month)
      } else {
        await assertAccountingDateOpen(ymd, head.store_name)
      }
    } catch {
      skippedClosed = true
      continue
    }
    await supabaseDeleteByFilter('journal_lines', `journal_entry_id=eq.${entryId}`)
    await supabaseDeleteByFilter('journal_entries', `id=eq.${entryId}`)
    deleted += 1
  }
  return { deleted, skippedClosed }
}
