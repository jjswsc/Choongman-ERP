import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { supabaseDeleteByFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  TAX_BOOK,
  formatTaxVoucherNo,
  resolveTaxBookMonthRange,
  roundTaxAmount,
  voucherKindForSourceType,
  type TaxVoucherKind,
} from '@/lib/tax-book'
import { isMissingTaxBookSchemaError, TAX_BOOK_SCHEMA_MISSING } from '@/lib/tax-book-period-server'
import type { TrialBalanceRow } from '@/lib/trial-balance-report'

export type TaxBookEntryRow = {
  id: number
  entryNo: string
  voucherNo: string
  voucherKind: TaxVoucherKind
  accountingDate: string
  sourceType: string
  memo: string | null
  debit: number
  credit: number
}

export type TaxBookLedgerLine = {
  accountCode: string
  accountName: string | null
  accountingDate: string
  voucherNo: string
  memo: string | null
  debit: number
  credit: number
}

type JournalHead = {
  id?: number
  entry_no?: string | null
  accounting_date?: string | null
  source_type?: string | null
  voucher_kind?: string | null
  memo?: string | null
}

function monthSourceId(yearMonth: string): number {
  return Number(String(yearMonth || '').replace('-', '').slice(0, 6)) || 0
}

export function taxBookMonthSourceId(yearMonth: string): number {
  return monthSourceId(yearMonth)
}

export async function loadTaxBookJournalHeads(input: {
  taxEntityCode: string
  yearMonth?: string
  fromMonth?: string
  toMonth?: string
}): Promise<{ schemaReady: boolean; heads: JournalHead[] }> {
  const entity = String(input.taxEntityCode || '').trim()
  const range = resolveTaxBookMonthRange(input.fromMonth || input.yearMonth || '', input.toMonth || input.yearMonth || input.fromMonth)
  if (!range.ok) throw new Error(range.error)
  const startStr = range.startDate
  const endStr = range.endDate
  if (!entity) return { schemaReady: true, heads: [] }
  const filter = [
    `book=eq.${TAX_BOOK}`,
    `tax_entity_code=eq.${encodeURIComponent(entity)}`,
    `accounting_date=gte.${encodeURIComponent(startStr)}`,
    `accounting_date=lte.${encodeURIComponent(endStr)}`,
  ].join('&')
  try {
    const rows = (await supabaseSelectFilterAllPages('journal_entries', filter, {
      select: 'id,entry_no,accounting_date,source_type,voucher_kind,memo',
      order: 'id.asc',
      pageSize: 2000,
      maxRows: 20000,
    })) as JournalHead[] | null
    return { schemaReady: true, heads: rows || [] }
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) return { schemaReady: false, heads: [] }
    throw e
  }
}

export async function loadTaxBookLines(entryIds: number[]): Promise<
  { journal_entry_id?: number; account_code?: string; account_name?: string | null; side?: string; amount?: number | string; memo?: string | null }[]
> {
  const ids = entryIds.filter((id) => id > 0)
  if (!ids.length) return []
  const out: {
    journal_entry_id?: number
    account_code?: string
    account_name?: string | null
    side?: string
    amount?: number | string
    memo?: string | null
  }[] = []
  const chunk = 400
  for (let i = 0; i < ids.length; i += chunk) {
    const idList = ids.slice(i, i + chunk).join(',')
    const lines = (await supabaseSelectFilterAllPages('journal_lines', `journal_entry_id=in.(${idList})`, {
      select: 'journal_entry_id,account_code,account_name,side,amount,memo',
      pageSize: 4000,
      maxRows: 100000,
    })) as typeof out | null
    out.push(...(lines || []))
  }
  return out
}

export function summarizeTaxBookTrial(
  lines: { account_code?: string; account_name?: string | null; side?: string; amount?: number | string }[]
): { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number } {
  const agg: Record<string, { debit: number; credit: number; name: string | null }> = {}
  for (const ln of lines) {
    const code = String(ln.account_code || '').trim()
    if (!code) continue
    const amt = Math.abs(Number(ln.amount) || 0)
    if (!agg[code]) agg[code] = { debit: 0, credit: 0, name: ln.account_name != null ? String(ln.account_name) : null }
    const side = String(ln.side || '').toLowerCase()
    if (side === 'debit') agg[code].debit += amt
    else if (side === 'credit') agg[code].credit += amt
  }
  const rows: TrialBalanceRow[] = Object.keys(agg)
    .sort()
    .map((accountCode) => {
      const { debit, credit, name } = agg[accountCode]
      return {
        accountCode,
        accountName: name,
        debit: roundTaxAmount(debit),
        credit: roundTaxAmount(credit),
        netDebit: roundTaxAmount(debit - credit),
      }
    })
  const totalDebit = roundTaxAmount(rows.reduce((s, r) => s + r.debit, 0))
  const totalCredit = roundTaxAmount(rows.reduce((s, r) => s + r.credit, 0))
  return { rows, totalDebit, totalCredit }
}

export function toTaxBookEntries(
  yearMonth: string,
  heads: JournalHead[],
  lines: { journal_entry_id?: number; side?: string; amount?: number | string }[]
): TaxBookEntryRow[] {
  const totals = new Map<number, { debit: number; credit: number }>()
  for (const ln of lines) {
    const id = Number(ln.journal_entry_id || 0)
    if (!id) continue
    const cur = totals.get(id) || { debit: 0, credit: 0 }
    const amt = Math.abs(Number(ln.amount) || 0)
    if (String(ln.side || '').toLowerCase() === 'credit') cur.credit += amt
    else cur.debit += amt
    totals.set(id, cur)
  }
  const seqByKind: Record<string, number> = {}
  return heads
    .map((h) => {
      const id = Number(h.id || 0)
      const kind = (String(h.voucher_kind || '').trim() || voucherKindForSourceType(h.source_type)) as TaxVoucherKind
      const dated = String(h.accounting_date || '').slice(0, 7)
      const ym = /^\d{4}-\d{2}$/.test(dated) ? dated : yearMonth
      const seqKey = `${ym}:${kind}`
      seqByKind[seqKey] = (seqByKind[seqKey] || 0) + 1
      const tot = totals.get(id) || { debit: 0, credit: 0 }
      return {
        id,
        entryNo: String(h.entry_no || ''),
        voucherNo: formatTaxVoucherNo(kind, ym, seqByKind[seqKey]),
        voucherKind: kind,
        accountingDate: String(h.accounting_date || '').slice(0, 10),
        sourceType: String(h.source_type || ''),
        memo: h.memo != null ? String(h.memo) : null,
        debit: roundTaxAmount(tot.debit),
        credit: roundTaxAmount(tot.credit),
      }
    })
    .filter((row) => row.id > 0)
}

export function toTaxBookLedger(
  yearMonth: string,
  heads: JournalHead[],
  lines: {
    journal_entry_id?: number
    account_code?: string
    account_name?: string | null
    side?: string
    amount?: number | string
    memo?: string | null
  }[]
): TaxBookLedgerLine[] {
  const entries = toTaxBookEntries(yearMonth, heads, lines)
  const byId = new Map(entries.map((e) => [e.id, e]))
  const headById = new Map(heads.map((h) => [Number(h.id || 0), h]))
  return lines
    .map((ln) => {
      const id = Number(ln.journal_entry_id || 0)
      const entry = byId.get(id)
      const head = headById.get(id)
      const amt = Math.abs(Number(ln.amount) || 0)
      const credit = String(ln.side || '').toLowerCase() === 'credit'
      return {
        accountCode: String(ln.account_code || ''),
        accountName: ln.account_name != null ? String(ln.account_name) : null,
        accountingDate: String(head?.accounting_date || '').slice(0, 10),
        voucherNo: entry?.voucherNo || '',
        memo: ln.memo != null ? String(ln.memo) : head?.memo != null ? String(head.memo) : null,
        debit: credit ? 0 : roundTaxAmount(amt),
        credit: credit ? roundTaxAmount(amt) : 0,
      }
    })
    .filter((ln) => ln.accountCode)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.accountingDate.localeCompare(b.accountingDate))
}

export async function deleteTaxBookSource(input: {
  sourceType: string
  sourceId: number
  taxEntityCode: string
}): Promise<void> {
  const filter = [
    `source_type=eq.${encodeURIComponent(input.sourceType)}`,
    `source_id=eq.${input.sourceId}`,
    `book=eq.${TAX_BOOK}`,
    `tax_entity_code=eq.${encodeURIComponent(input.taxEntityCode)}`,
  ].join('&')
  let rows: { id?: number }[] | null = null
  try {
    rows = (await supabaseSelectFilterAllPages('journal_entries', filter, {
      select: 'id',
      pageSize: 100,
      maxRows: 100,
    })) as { id?: number }[] | null
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) throw new Error(TAX_BOOK_SCHEMA_MISSING)
    throw e
  }
  const ids = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  if (!ids.length) return
  const idList = ids.join(',')
  await supabaseDeleteByFilter('journal_lines', `journal_entry_id=in.(${idList})`)
  await supabaseDeleteByFilter('journal_entries', `id=in.(${idList})`)
}

export function taxBookClosingLines(rows: TrialBalanceRow[]) {
  const preview = buildIncomeExpenseClosingPreview({
    trial: {
      yearMonth: '',
      startStr: '',
      endStr: '',
      storeFilter: '',
      timezone: 'Asia/Bangkok',
      rows,
      totalDebit: 0,
      totalCredit: 0,
      diff: 0,
    },
    profitLossAccountCode: '3120',
    profitLossAccountName: accountLine('3120').accountName,
  })
  return preview
}
