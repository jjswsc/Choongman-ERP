/**
 * 2026-07-01 이후 매입·지출 분개: VAT 분리 + PV/PP voucher_kind 소급.
 * pos_orders UPDATE 없음. journal_entries / journal_lines만.
 *
 * npx tsx scripts/backfill-tax-purchase-vat-split.ts --dry
 * npx tsx scripts/backfill-tax-purchase-vat-split.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  TAX_ACCOUNTS,
  taxPurchaseExpenseJournalLines,
  voucherKindForPaidExpense,
} from '../lib/tax-book'

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  process.exit(1)
}

const dry = process.argv.includes('--dry')
const FROM = '2026-07-01'

const headers: Record<string, string> = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function restPage<T>(path: string, offset: number, limit: number): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      ...headers,
      Range: `${offset}-${offset + limit - 1}`,
      Prefer: 'count=exact',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`)
  return text ? (JSON.parse(text) as T[]) : []
}

type Head = {
  id?: number
  source_type?: string
  source_id?: number | null
  voucher_kind?: string | null
  memo?: string | null
  book?: string | null
  accounting_date?: string
}

type Line = {
  id?: number
  journal_entry_id?: number
  line_no?: number
  account_code?: string
  account_name?: string | null
  side?: string
  amount?: number | string
  account_subject_id?: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function hasInputVat(lines: Line[]): boolean {
  return lines.some(
    (l) =>
      String(l.account_code || '') === TAX_ACCOUNTS.inputVat &&
      String(l.side || '').toLowerCase() === 'debit' &&
      Math.abs(Number(l.amount) || 0) > 0
  )
}

function pickDebitExpense(lines: Line[]): {
  code: string
  name: string
  subjectId: number | null
} | null {
  const debits = lines.filter(
    (l) =>
      String(l.side || '').toLowerCase() === 'debit' &&
      String(l.account_code || '') !== TAX_ACCOUNTS.inputVat &&
      Math.abs(Number(l.amount) || 0) > 0
  )
  if (!debits.length) return null
  const top = [...debits].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0))[0]
  return {
    code: String(top.account_code || '').trim() || '5520',
    name: String(top.account_name || top.account_code || '5520').trim(),
    subjectId: top.account_subject_id != null && Number(top.account_subject_id) > 0 ? Number(top.account_subject_id) : null,
  }
}

function pickCredit(lines: Line[]): { code: string; name: string } | null {
  const credits = lines.filter(
    (l) => String(l.side || '').toLowerCase() === 'credit' && Math.abs(Number(l.amount) || 0) > 0
  )
  if (!credits.length) return null
  const top = [...credits].sort((a, b) => Math.abs(Number(b.amount) || 0) - Math.abs(Number(a.amount) || 0))[0]
  return {
    code: String(top.account_code || '').trim() || '2110',
    name: String(top.account_name || top.account_code || '2110').trim(),
  }
}

function grossFromLines(lines: Line[]): number {
  const credit = lines
    .filter((l) => String(l.side || '').toLowerCase() === 'credit')
    .reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0)
  return round2(credit)
}

async function loadLines(entryId: number): Promise<Line[]> {
  return (await rest(
    `journal_lines?journal_entry_id=eq.${entryId}&select=id,journal_entry_id,line_no,account_code,account_name,side,amount,account_subject_id&order=line_no.asc`
  )) as Line[]
}

async function rewriteEntry(entry: Head, vatAmount: number, forceKind?: string): Promise<'split' | 'kind' | 'skip'> {
  const id = Number(entry.id || 0)
  if (!id) return 'skip'
  const lines = await loadLines(id)
  if (lines.length < 2) return 'skip'
  const gross = grossFromLines(lines)
  const vat = Math.min(Math.max(0, round2(vatAmount)), gross)
  const debit = pickDebitExpense(lines)
  const credit = pickCredit(lines)
  if (!debit || !credit || gross <= 0) return 'skip'

  const needSplit = vat > 0 && !hasInputVat(lines)
  const wantKind =
    forceKind ||
    (String(entry.source_type) === 'expense_accrual' || String(entry.source_type) === 'store_purchase'
      ? 'purchase'
      : voucherKindForPaidExpense(vat))
  const kindDiff = String(entry.voucher_kind || '') !== wantKind

  if (!needSplit && !kindDiff) return 'skip'

  if (needSplit) {
    const drafts = taxPurchaseExpenseJournalLines({
      gross,
      vatAmount: vat,
      debitCode: debit.code,
      debitName: debit.name,
      creditCode: credit.code,
      creditName: credit.name,
    })
    if (drafts.length < 2) return 'skip'
    if (dry) return 'split'
    await rest(`journal_lines?journal_entry_id=eq.${id}`, { method: 'DELETE' })
    await rest('journal_lines', {
      method: 'POST',
      body: JSON.stringify(
        drafts.map((ln, i) => ({
          journal_entry_id: id,
          line_no: i + 1,
          account_code: ln.accountCode,
          account_name: ln.accountName,
          side: ln.side,
          amount: ln.amount,
          account_subject_id:
            ln.side === 'debit' && ln.accountCode !== TAX_ACCOUNTS.inputVat ? debit.subjectId : null,
        }))
      ),
    })
    await rest(`journal_entries?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ voucher_kind: wantKind }),
    })
    return 'split'
  }

  if (kindDiff) {
    if (dry) return 'kind'
    await rest(`journal_entries?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ voucher_kind: wantKind }),
    })
    return 'kind'
  }
  return 'skip'
}

async function processSourceMap(
  label: string,
  vatBySourceId: Map<number, number>,
  sourceType: string,
  forceKind?: string
) {
  let split = 0
  let kind = 0
  let skipped = 0
  let failed = 0
  const ids = [...vatBySourceId.keys()]
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const heads = (await rest(
      `journal_entries?source_type=eq.${encodeURIComponent(sourceType)}&source_id=in.(${chunk.join(',')})&accounting_date=gte.${FROM}&select=id,source_type,source_id,voucher_kind,memo,book,accounting_date`
    )) as Head[]
    for (const h of heads || []) {
      const sid = Number(h.source_id || 0)
      const vat = vatBySourceId.get(sid) || 0
      try {
        const r = await rewriteEntry(h, vat, forceKind)
        if (r === 'split') split += 1
        else if (r === 'kind') kind += 1
        else skipped += 1
      } catch (e) {
        failed += 1
        console.error('fail', label, h.id, sid, e instanceof Error ? e.message : e)
      }
    }
    console.log(label, 'chunk', i, 'split', split, 'kind', kind, 'skipped', skipped, 'failed', failed)
  }
  return { split, kind, skipped, failed }
}

async function loadVatMap(
  table: string,
  idCol: string,
  dateCol: string,
  extraFilter = ''
): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const page = 1000
  let offset = 0
  for (;;) {
    const filter = extraFilter ? `&${extraFilter}` : ''
    const rows = await restPage<{ id?: number; vat_amount?: number | null }>(
      `${table}?select=${idCol},vat_amount&${dateCol}=gte.${FROM}&vat_amount=gt.0${filter}&order=${idCol}.asc`,
      offset,
      page
    )
    for (const r of rows) {
      const id = Number((r as { id?: number }).id || 0)
      const vat = Math.abs(Number(r.vat_amount) || 0)
      if (id > 0 && vat > 0) map.set(id, round2(vat))
    }
    if (rows.length < page) break
    offset += page
  }
  return map
}

/** VAT 없는 시재 지출 → PP, VAT 있는 시재 → PV (이미 split에서 처리) */
async function reclassPettyNoVat() {
  let updated = 0
  const page = 500
  let offset = 0
  for (;;) {
    const heads = await restPage<Head>(
      `journal_entries?source_type=eq.petty_cash&accounting_date=gte.${FROM}&select=id,source_id,voucher_kind,memo&order=id.asc`,
      offset,
      page
    )
    if (!heads.length) break
    const sourceIds = heads.map((h) => Number(h.source_id || 0)).filter((n) => n > 0)
    const vatMap = new Map<number, number>()
    if (sourceIds.length) {
      for (let i = 0; i < sourceIds.length; i += 100) {
        const chunk = sourceIds.slice(i, i + 100)
        const rows = (await rest(
          `petty_cash_transactions?id=in.(${chunk.join(',')})&select=id,vat_amount`
        )) as { id?: number; vat_amount?: number | null }[]
        for (const r of rows || []) {
          vatMap.set(Number(r.id || 0), Math.abs(Number(r.vat_amount) || 0))
        }
      }
    }
    for (const h of heads) {
      const sid = Number(h.source_id || 0)
      const memo = String(h.memo || '')
      if (memo.includes('보충') || /replenish/i.test(memo)) {
        if (String(h.voucher_kind || '') !== 'payment') {
          if (!dry) {
            await rest(`journal_entries?id=eq.${Number(h.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ voucher_kind: 'payment' }),
            })
          }
          updated += 1
        }
        continue
      }
      const vat = vatMap.get(sid) || 0
      const want = voucherKindForPaidExpense(vat)
      if (String(h.voucher_kind || '') === want) continue
      if (!dry) {
        await rest(`journal_entries?id=eq.${Number(h.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ voucher_kind: want }),
        })
      }
      updated += 1
    }
    if (heads.length < page) break
    offset += page
  }
  return updated
}

async function reclassBankPaidExpense() {
  let updated = 0
  const page = 500
  let offset = 0
  for (;;) {
    const heads = await restPage<Head>(
      `journal_entries?source_type=eq.bank_transaction&accounting_date=gte.${FROM}&select=id,source_id,voucher_kind&order=id.asc`,
      offset,
      page
    )
    if (!heads.length) break
    const sourceIds = heads.map((h) => Number(h.source_id || 0)).filter((n) => n > 0)
    const meta = new Map<number, { vat: number; category: string }>()
    for (let i = 0; i < sourceIds.length; i += 100) {
      const chunk = sourceIds.slice(i, i + 100)
      const rows = (await rest(
        `bank_transactions?id=in.(${chunk.join(',')})&select=id,vat_amount,category,trans_type`
      )) as { id?: number; vat_amount?: number | null; category?: string | null; trans_type?: string | null }[]
      for (const r of rows || []) {
        meta.set(Number(r.id || 0), {
          vat: Math.abs(Number(r.vat_amount) || 0),
          category: String(r.category || '').toLowerCase(),
        })
      }
    }
    for (const h of heads) {
      const sid = Number(h.source_id || 0)
      const m = meta.get(sid)
      if (!m) continue
      if (m.category !== 'expense' && m.category !== 'fixed_asset') continue
      const want = voucherKindForPaidExpense(m.vat)
      if (String(h.voucher_kind || '') === want) continue
      // VAT split for bank expense handled in processSourceMap when vat>0
      if (m.vat > 0) continue
      if (!dry) {
        await rest(`journal_entries?id=eq.${Number(h.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ voucher_kind: want }),
        })
      }
      updated += 1
    }
    if (heads.length < page) break
    offset += page
  }
  return updated
}

async function main() {
  console.log({ dry, from: FROM })

  const accrualVat = await loadVatMap('expense_accruals', 'id', 'expense_date')
  console.log('expense_accruals with vat', accrualVat.size)
  const a = await processSourceMap('expense_accrual', accrualVat, 'expense_accrual', 'purchase')

  const pettyVat = await loadVatMap('petty_cash_transactions', 'id', 'trans_date', 'trans_type=eq.expense')
  console.log('petty_cash with vat', pettyVat.size)
  const p = await processSourceMap('petty_cash', pettyVat, 'petty_cash')

  let bankVat = new Map<number, number>()
  try {
    bankVat = await loadVatMap('bank_transactions', 'id', 'trans_date', 'trans_type=eq.withdraw')
  } catch (e) {
    console.warn('bank vat map skipped', e instanceof Error ? e.message : e)
  }
  console.log('bank withdraw with vat', bankVat.size)
  const b = await processSourceMap('bank_transaction', bankVat, 'bank_transaction')

  const pettyKind = await reclassPettyNoVat()
  const bankKind = await reclassBankPaidExpense()

  // 기본 장부 종류 (매출/수취/조정)
  let baseKind = 0
  const kindPatches: { sourceTypes: string[]; kind: string }[] = [
    { sourceTypes: ['pos_channel_settlement', 'pos_deposit_receive'], kind: 'receipt' },
    { sourceTypes: ['expense_accrual', 'store_purchase'], kind: 'purchase' },
    { sourceTypes: ['pos_order', 'pos_order_reversal', 'pos_day_close'], kind: 'sales' },
    {
      sourceTypes: ['tax_adjustment', 'tax_manual', 'depreciation', 'tax_opening', 'tax_payroll', 'tax_vat_summary'],
      kind: 'general',
    },
  ]
  for (const patch of kindPatches) {
    const page = 1000
    let offset = 0
    let n = 0
    for (;;) {
      const rows = await restPage<{ id?: number; voucher_kind?: string | null }>(
        `journal_entries?source_type=in.(${patch.sourceTypes.join(',')})&accounting_date=gte.${FROM}&select=id,voucher_kind&order=id.asc`,
        offset,
        page
      )
      const need = rows.filter((r) => String(r.voucher_kind || '') !== patch.kind)
      for (let i = 0; i < need.length; i += 100) {
        const chunk = need.slice(i, i + 100).map((r) => Number(r.id)).filter((id) => id > 0)
        if (!chunk.length) continue
        if (!dry) {
          await rest(`journal_entries?id=in.(${chunk.join(',')})`, {
            method: 'PATCH',
            body: JSON.stringify({ voucher_kind: patch.kind }),
          })
        }
        n += chunk.length
      }
      if (rows.length < page) break
      offset += page
    }
    baseKind += n
    console.log('base kind', patch.kind, n)
  }

  console.log({
    dry,
    accrual: a,
    petty: p,
    bank: b,
    pettyKind,
    bankKind,
    baseKind,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
