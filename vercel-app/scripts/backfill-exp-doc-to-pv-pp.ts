/**
 * 구형 EXP 문서번호 → VAT 기준 PV/PP + 세무 전표 entry_no·voucher_kind 정리
 * npx tsx scripts/backfill-exp-doc-to-pv-pp.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { remapExpDocumentNoToPvPp, parseExpenseDocumentNo } from '../lib/expense-document-no'

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

async function entryTaken(doc: string, excludeId?: number): Promise<boolean> {
  const excl = excludeId ? `&id=neq.${excludeId}` : ''
  const rows = (await rest(
    `journal_entries?entry_no=eq.${encodeURIComponent(doc)}${excl}&select=id&limit=1`
  )) as { id?: number }[]
  return Array.isArray(rows) && rows.length > 0
}

async function main() {
  let accrualUpdated = 0
  let journalUpdated = 0
  let bankUpdated = 0
  let skipped = 0
  let offset = 0

  for (;;) {
    const rows = await page<{
      id?: number
      document_no?: string | null
      vat_amount?: number | null
    }>(
      `expense_accruals?select=id,document_no,vat_amount&document_no=like.EXP*&order=id.asc`,
      offset,
      100
    )
    if (!rows.length) break

    for (const a of rows) {
      const id = Number(a.id || 0)
      const oldDoc = String(a.document_no || '').trim()
      const next = remapExpDocumentNoToPvPp(oldDoc, a.vat_amount)
      if (!id || !next || next === oldDoc) continue

      // accrual unique document_no
      const clash = (await rest(
        `expense_accruals?document_no=eq.${encodeURIComponent(next)}&id=neq.${id}&select=id&limit=1`
      )) as { id?: number }[]
      if (clash?.length) {
        skipped += 1
        console.warn('accrual clash', id, oldDoc, '→', next)
        continue
      }

      await rest(`expense_accruals?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ document_no: next }),
      })
      accrualUpdated += 1

      // bank / card / petty copies
      for (const table of ['bank_transactions', 'card_transactions', 'petty_cash_transactions'] as const) {
        try {
          const copies = (await rest(
            `${table}?document_no=eq.${encodeURIComponent(oldDoc)}&select=id`
          )) as { id?: number }[]
          for (const c of copies || []) {
            const cid = Number(c.id || 0)
            if (!cid) continue
            await rest(`${table}?id=eq.${cid}`, {
              method: 'PATCH',
              body: JSON.stringify({ document_no: next }),
            })
            if (table === 'bank_transactions') bankUpdated += 1
          }
        } catch {
          /* table may miss column */
        }
      }

      const kind = (a.vat_amount != null && Number(a.vat_amount) > 0 ? 'purchase' : 'payment') as string
      const heads = (await rest(
        `journal_entries?source_type=eq.expense_accrual&source_id=eq.${id}&book=eq.tax&select=id,entry_no,voucher_kind`
      )) as { id?: number; entry_no?: string; voucher_kind?: string }[]

      for (const h of heads || []) {
        const jid = Number(h.id || 0)
        if (!jid) continue
        const patch: Record<string, string> = { voucher_kind: kind }
        const cur = String(h.entry_no || '')
        if (cur === oldDoc || cur.startsWith('EXP') || cur.startsWith('JE-')) {
          if (!(await entryTaken(next, jid))) {
            patch.entry_no = next
          }
        } else if (cur !== next && parseExpenseDocumentNo(cur)?.prefix === 'EXP') {
          if (!(await entryTaken(next, jid))) patch.entry_no = next
        }
        await rest(`journal_entries?id=eq.${jid}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
        journalUpdated += 1
      }
    }

    console.log('offset', offset, { accrualUpdated, journalUpdated, bankUpdated, skipped })
    if (rows.length < 100) break
    offset += 100
  }

  // bank-only EXP (no accrual) → PP default unless vat on bank row
  offset = 0
  let bankOnly = 0
  for (;;) {
    const banks = await page<{ id?: number; document_no?: string; vat_amount?: number | null }>(
      `bank_transactions?select=id,document_no&document_no=like.EXP*&order=id.asc`,
      offset,
      100
    )
    if (!banks.length) break
    for (const b of banks) {
      const id = Number(b.id || 0)
      const oldDoc = String(b.document_no || '').trim()
      const next = remapExpDocumentNoToPvPp(oldDoc, 0)
      if (!id || !next || next === oldDoc) continue
      await rest(`bank_transactions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ document_no: next }),
      })
      const heads = (await rest(
        `journal_entries?source_type=eq.bank_transaction&source_id=eq.${id}&book=eq.tax&select=id,entry_no`
      )) as { id?: number; entry_no?: string }[]
      for (const h of heads || []) {
        const jid = Number(h.id || 0)
        if (!jid) continue
        if (String(h.entry_no || '') !== oldDoc) continue
        if (await entryTaken(next, jid)) continue
        await rest(`journal_entries?id=eq.${jid}`, {
          method: 'PATCH',
          body: JSON.stringify({ entry_no: next, voucher_kind: 'payment' }),
        })
      }
      bankOnly += 1
    }
    console.log('bank-only offset', offset, bankOnly)
    if (banks.length < 100) break
    offset += 100
  }

  console.log({ accrualUpdated, journalUpdated, bankUpdated, skipped, bankOnly })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
