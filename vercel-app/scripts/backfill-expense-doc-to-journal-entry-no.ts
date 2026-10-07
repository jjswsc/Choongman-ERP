/**
 * expense/bank document_no → 세무 journal_entries.entry_no 소급
 * (entry_no UNIQUE: 회사 장부는 JE- 유지, 세무 book만 EXP)
 * npx tsx scripts/backfill-expense-doc-to-journal-entry-no.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('missing env')
  process.exit(1)
}

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
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

async function page<T>(path: string, offset: number, limit: number): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { ...headers, Range: `${offset}-${offset + limit - 1}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text.slice(0, 300))
  return text ? (JSON.parse(text) as T[]) : []
}

async function entryNoTaken(doc: string, excludeId: number): Promise<boolean> {
  const rows = (await rest(
    `journal_entries?entry_no=eq.${encodeURIComponent(doc)}&id=neq.${excludeId}&select=id&limit=1`
  )) as { id?: number }[]
  return Array.isArray(rows) && rows.length > 0
}

async function sync(sourceType: string, table: string, dateCol: string) {
  let updated = 0
  let skippedTaken = 0
  let offset = 0
  for (;;) {
    const rows = await page<{ id?: number; document_no?: string }>(
      `${table}?select=id,document_no&document_no=not.is.null&${dateCol}=gte.2026-07-01&order=id.asc`,
      offset,
      200
    )
    if (!rows.length) break
    for (const a of rows) {
      const doc = String(a.document_no || '').trim()
      const sid = Number(a.id || 0)
      if (!doc || !sid) continue
      const heads = (await rest(
        `journal_entries?source_type=eq.${sourceType}&source_id=eq.${sid}&book=eq.tax&accounting_date=gte.2026-07-01&select=id,entry_no`
      )) as { id?: number; entry_no?: string }[]
      for (const h of heads || []) {
        const jid = Number(h.id || 0)
        if (!jid) continue
        if (String(h.entry_no || '') === doc) continue
        if (await entryNoTaken(doc, jid)) {
          skippedTaken += 1
          continue
        }
        await rest(`journal_entries?id=eq.${jid}`, {
          method: 'PATCH',
          body: JSON.stringify({ entry_no: doc }),
        })
        updated += 1
      }
    }
    console.log(sourceType, 'offset', offset, 'updated', updated, 'skippedTaken', skippedTaken)
    if (rows.length < 200) break
    offset += 200
  }
  return { updated, skippedTaken }
}

async function main() {
  const a = await sync('expense_accrual', 'expense_accruals', 'expense_date')
  const b = await sync('bank_transaction', 'bank_transactions', 'trans_date')
  let c = { updated: 0, skippedTaken: 0 }
  try {
    c = await sync('petty_cash', 'petty_cash_transactions', 'trans_date')
  } catch (e) {
    console.warn('petty skip', e instanceof Error ? e.message : e)
  }
  console.log({ accrual: a, bank: b, petty: c })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
