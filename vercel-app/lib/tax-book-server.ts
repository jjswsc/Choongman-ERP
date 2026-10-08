import { syncPettyCashExpenseAccount } from '@/lib/accounting-posting'
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { buildIncomeExpenseClosingPreview } from '@/lib/income-expense-closing'
import { resolveAccountSubjectIdsByCodes } from '@/lib/journal-account-subject-resolve'
import {
  supabaseDeleteByFilter,
  supabaseInsertMany,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import {
  TAX_BOOK,
  formatTaxVoucherNo,
  resolveTaxBookMonthRange,
  roundTaxAmount,
  applyRecordedPettyExpenseAccount,
  journalClearsTradeReceivable,
  taxBookIssuedDocumentNo,
  taxJournalBalanced,
  voucherKindAfterLineSignals,
  voucherKindForRecordedVat,
  type TaxVoucherKind,
} from '@/lib/tax-book'
import { taxBookStatusFromMemo } from '@/lib/tax-book-voucher-memo'
import {
  assertTaxAccountingPeriodOpen,
  isMissingTaxBookSchemaError,
  TAX_BOOK_SCHEMA_MISSING,
} from '@/lib/tax-book-period-server'
import type { TrialBalanceRow } from '@/lib/trial-balance-report'

export type TaxBookEntryRow = {
  id: number
  entryNo: string
  /** 발행 문서번호. 일별장부 번호(voucherNo)와 다르다. JE- 내부번호는 비운다. */
  referenceNo: string
  voucherNo: string
  voucherKind: TaxVoucherKind
  accountingDate: string
  sourceType: string
  memo: string | null
  debit: number
  credit: number
  postingStatus?: 'draft' | 'approved'
}

export type TaxBookLedgerLine = {
  accountCode: string
  accountName: string | null
  accountingDate: string
  voucherNo: string
  memo: string | null
  sourceType?: string | null
  debit: number
  credit: number
}

type JournalHead = {
  id?: number
  entry_no?: string | null
  accounting_date?: string | null
  source_type?: string | null
  source_id?: number | null
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
      select: 'id,entry_no,accounting_date,source_type,source_id,voucher_kind,memo',
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

export type TaxBookVoucherLineView = {
  accountCode: string
  accountName: string | null
  debit: number
  credit: number
  memo: string | null
}

/** 전표 한 장의 차대 라인. 다른 법인의 전표면 null. */
export async function loadTaxBookVoucherLines(
  entryId: number,
  taxEntityCode: string
): Promise<TaxBookVoucherLineView[] | null> {
  const id = Number(entryId || 0)
  const entity = String(taxEntityCode || '').trim()
  if (!id || !entity) return null
  const filter = [
    `id=eq.${id}`,
    `book=eq.${TAX_BOOK}`,
    `tax_entity_code=eq.${encodeURIComponent(entity)}`,
  ].join('&')
  let heads: { id?: number }[] | null = null
  try {
    heads = (await supabaseSelectFilter('journal_entries', filter, {
      select: 'id',
      limit: 1,
    })) as { id?: number }[] | null
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) return []
    throw e
  }
  if (!heads?.length) return null
  const lines = await loadTaxBookLines([id])
  return lines
    .map((ln) => {
      const amt = Math.abs(Number(ln.amount) || 0)
      const credit = String(ln.side || '').toLowerCase() === 'credit'
      return {
        accountCode: String(ln.account_code || '').trim(),
        accountName: ln.account_name != null ? String(ln.account_name) : null,
        debit: credit ? 0 : roundTaxAmount(amt),
        credit: credit ? roundTaxAmount(amt) : 0,
        memo: ln.memo != null ? String(ln.memo) : null,
      }
    })
    .filter((ln) => ln.accountCode)
    .sort((a, b) => {
      const aDebit = a.debit > 0 ? 0 : 1
      const bDebit = b.debit > 0 ? 0 : 1
      if (aDebit !== bDebit) return aDebit - bDebit
      return a.accountCode.localeCompare(b.accountCode)
    })
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

type PettyAccountRow = { id?: number; account_subject_id?: number | null }
type SubjectCodeRow = { id?: number; code?: string | null; name?: string | null }

async function loadPettyCashRecordedAccounts(
  pettyIds: number[]
): Promise<Map<number, { code: string; name: string }>> {
  const out = new Map<number, { code: string; name: string }>()
  const ids = [...new Set(pettyIds.map((id) => Math.floor(Number(id) || 0)).filter((id) => id > 0))]
  if (!ids.length) return out
  const pettyRows: PettyAccountRow[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150).join(',')
    const rows = (await supabaseSelectFilter('petty_cash_transactions', `id=in.(${chunk})`, {
      select: 'id,account_subject_id',
      limit: 200,
    })) as PettyAccountRow[] | null
    pettyRows.push(...(rows || []))
  }
  const subjectIds = [...new Set(pettyRows.map((row) => Math.floor(Number(row.account_subject_id) || 0)).filter((id) => id > 0))]
  if (!subjectIds.length) return out
  const subjects = new Map<number, { code: string; name: string }>()
  for (let i = 0; i < subjectIds.length; i += 150) {
    const chunk = subjectIds.slice(i, i + 150).join(',')
    const rows = (await supabaseSelectFilter('account_subjects', `id=in.(${chunk})`, {
      select: 'id,code,name',
      limit: 200,
    })) as SubjectCodeRow[] | null
    for (const row of rows || []) {
      const id = Math.floor(Number(row.id) || 0)
      const code = String(row.code || '').trim()
      if (id > 0 && code) subjects.set(id, { code, name: String(row.name || code).trim() || code })
    }
  }
  for (const row of pettyRows) {
    const pettyId = Math.floor(Number(row.id) || 0)
    const subject = subjects.get(Math.floor(Number(row.account_subject_id) || 0))
    if (pettyId > 0 && subject) out.set(pettyId, subject)
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
  lines: { journal_entry_id?: number; account_code?: string; side?: string; amount?: number | string }[]
): TaxBookEntryRow[] {
  const totals = new Map<number, { debit: number; credit: number }>()
  const inputVatIds = new Set<number>()
  const clearsReceivableIds = new Set<number>()
  const linesByEntry = new Map<number, typeof lines>()
  for (const ln of lines) {
    const id = Number(ln.journal_entry_id || 0)
    if (!id) continue
    const cur = totals.get(id) || { debit: 0, credit: 0 }
    const amt = Math.abs(Number(ln.amount) || 0)
    if (String(ln.side || '').toLowerCase() === 'credit') cur.credit += amt
    else cur.debit += amt
    totals.set(id, cur)
    const bucket = linesByEntry.get(id)
    if (bucket) bucket.push(ln)
    else linesByEntry.set(id, [ln])
    if (amt > 0.0001 && String(ln.account_code || '').trim() === '1360') inputVatIds.add(id)
  }
  for (const [id, entryLines] of linesByEntry) {
    if (journalClearsTradeReceivable(entryLines)) clearsReceivableIds.add(id)
  }
  const seqByKind: Record<string, number> = {}
  return heads
    .map((h) => {
      const id = Number(h.id || 0)
      const kind = voucherKindAfterLineSignals(
        voucherKindForRecordedVat(h.source_type, h.voucher_kind, inputVatIds.has(id)),
        { clearsTradeReceivable: clearsReceivableIds.has(id) }
      )
      const dated = String(h.accounting_date || '').slice(0, 7)
      const ym = /^\d{4}-\d{2}$/.test(dated) ? dated : yearMonth
      const seqKey = `${ym}:${kind}`
      seqByKind[seqKey] = (seqByKind[seqKey] || 0) + 1
      const generated = formatTaxVoucherNo(kind, ym, seqByKind[seqKey])
      const tot = totals.get(id) || { debit: 0, credit: 0 }
      const memo = h.memo != null ? String(h.memo) : null
      const entryNo = String(h.entry_no || '')
      return {
        id,
        entryNo,
        referenceNo: taxBookIssuedDocumentNo(entryNo),
        voucherNo: generated,
        voucherKind: kind,
        accountingDate: String(h.accounting_date || '').slice(0, 10),
        sourceType: String(h.source_type || ''),
        memo,
        debit: roundTaxAmount(tot.debit),
        credit: roundTaxAmount(tot.credit),
        postingStatus: taxBookStatusFromMemo(memo),
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
        sourceType: head?.source_type != null ? String(head.source_type) : entry?.sourceType || null,
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

export type TaxBookVoucherDetail = {
  lines: TaxBookVoucherLineView[]
  sourceType: string
  sourceId: number
  accountingDate: string
}

export async function loadTaxBookVoucherDetail(
  entryId: number,
  taxEntityCode: string
): Promise<TaxBookVoucherDetail | null> {
  const id = Number(entryId || 0)
  const entity = String(taxEntityCode || '').trim()
  if (!id || !entity) return null
  const filter = [
    `id=eq.${id}`,
    `book=eq.${TAX_BOOK}`,
    `tax_entity_code=eq.${encodeURIComponent(entity)}`,
  ].join('&')
  type VoucherHead = {
    id?: number
    source_type?: string | null
    source_id?: number | null
    accounting_date?: string | null
  }
  let heads: VoucherHead[] | null = null
  try {
    heads = (await supabaseSelectFilter('journal_entries', filter, {
      select: 'id,source_type,source_id,accounting_date',
      limit: 1,
    })) as VoucherHead[] | null
  } catch (e) {
    if (isMissingTaxBookSchemaError(e)) {
      return { lines: [], sourceType: '', sourceId: 0, accountingDate: '' }
    }
    throw e
  }
  const head = heads?.[0]
  if (!head?.id) return null
  const sourceType = String(head.source_type || '')
  const sourceId = Number(head.source_id || 0)
  if (sourceType === 'petty_cash' && sourceId > 0) {
    try {
      await syncPettyCashExpenseAccount({ pettyCashId: sourceId })
    } catch (e) {
      console.warn('petty cash voucher account sync:', sourceId, e)
    }
  }
  const lines = await loadTaxBookVoucherLines(id, entity)
  let shown = lines || []
  if (sourceType === 'petty_cash' && sourceId > 0 && shown.length) {
    const recorded = await loadPettyCashRecordedAccounts([sourceId])
    const account = recorded.get(sourceId)
    if (account) shown = applyRecordedPettyExpenseAccount(shown, account)
  }
  return {
    lines: shown,
    sourceType,
    sourceId,
    accountingDate: String(head.accounting_date || '').slice(0, 10),
  }
}

export async function replaceTaxBookVoucherLines(input: {
  entryId: number
  taxEntityCode: string
  lines: { accountCode: string; accountName: string; side: 'debit' | 'credit'; amount: number; memo?: string | null }[]
}): Promise<void> {
  const id = Math.floor(Number(input.entryId) || 0)
  const entity = String(input.taxEntityCode || '').trim()
  if (!id || !entity) throw new Error('NOT_FOUND')
  const drafts = input.lines
    .map((ln) => ({
      accountCode: String(ln.accountCode || '').trim(),
      accountName: String(ln.accountName || '').trim() || String(ln.accountCode || '').trim(),
      side: ln.side === 'credit' ? ('credit' as const) : ('debit' as const),
      amount: roundTaxAmount(Math.abs(Number(ln.amount) || 0)),
      memo: String(ln.memo || '').trim().slice(0, 500),
    }))
    .filter((ln) => ln.accountCode && ln.amount > 0)
  if (!taxJournalBalanced(drafts)) throw new Error('UNBALANCED')
  const heads = (await supabaseSelectFilter(
    'journal_entries',
    `id=eq.${id}&book=eq.${TAX_BOOK}&tax_entity_code=eq.${encodeURIComponent(entity)}`,
    { select: 'id,accounting_date', limit: 1 }
  )) as { id?: number; accounting_date?: string | null }[] | null
  const head = heads?.[0]
  if (!head?.id) throw new Error('NOT_FOUND')
  const accountingDate = String(head.accounting_date || '').slice(0, 10)
  await assertTaxAccountingPeriodOpen(entity, accountingDate.slice(0, 7))
  const codeToSubjectId = await resolveAccountSubjectIdsByCodes(drafts.map((ln) => ln.accountCode))
  await supabaseDeleteByFilter('journal_lines', `journal_entry_id=eq.${id}`)
  await supabaseInsertMany(
    'journal_lines',
    drafts.map((ln, i) => {
      const codeKey = ln.accountCode.trim().toUpperCase()
      return {
        journal_entry_id: id,
        line_no: i + 1,
        account_code: ln.accountCode,
        account_name: ln.accountName,
        side: ln.side,
        amount: ln.amount,
        memo: ln.memo || null,
        account_subject_id: codeToSubjectId.get(codeKey) ?? null,
      }
    })
  )
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
