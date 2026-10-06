/**
 * 2026-07-01 이후 기업 분개 → 세무 장부(book=tax) 복제.
 * pos_orders UPDATE 없음. journal_entries / journal_lines INSERT만.
 *
 * npx tsx scripts/backfill-tax-journal-mirrors.ts --dry
 * npx tsx scripts/backfill-tax-journal-mirrors.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  TAX_BOOK,
  taxEntityCodeFromStoreName,
  voucherKindForSourceType,
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
  accounting_date?: string
  source_type?: string
  source_id?: number | null
  store_name?: string | null
  memo?: string | null
  posted_by?: string | null
  book?: string | null
  voucher_kind?: string | null
}

type Line = {
  journal_entry_id?: number
  line_no?: number
  account_code?: string
  account_name?: string | null
  side?: string
  amount?: number | string
  memo?: string | null
  account_subject_id?: number | null
}

function twinKey(sourceType: string, sourceId: number, entity: string): string {
  return `${sourceType}|${sourceId}|${entity}`
}

async function loadExistingTaxKeys(): Promise<Set<string>> {
  const set = new Set<string>()
  const page = 1000
  let offset = 0
  for (;;) {
    const rows = await restPage<Head>(
      `journal_entries?select=source_type,source_id,tax_entity_code&book=eq.${TAX_BOOK}&source_id=not.is.null&source_id=gt.0`,
      offset,
      page
    )
    for (const r of rows) {
      const sid = Number(r.source_id || 0)
      const st = String(r.source_type || '')
      const ent = String((r as { tax_entity_code?: string }).tax_entity_code || '')
      if (sid > 0 && st && ent) set.add(twinKey(st, sid, ent))
    }
    if (rows.length < page) break
    offset += page
  }
  return set
}

async function main() {
  const existing = await loadExistingTaxKeys()
  console.log('existing tax twins', existing.size, 'dry', dry)

  const page = 500
  let offset = 0
  let mirrored = 0
  let skipped = 0
  let failed = 0
  for (;;) {
    const ops = await restPage<Head>(
      `journal_entries?select=id,accounting_date,source_type,source_id,store_name,memo,posted_by,book,voucher_kind&accounting_date=gte.${FROM}&source_id=not.is.null&source_id=gt.0&or=(book.is.null,book.neq.${TAX_BOOK})&order=id.asc`,
      offset,
      page
    )
    if (!ops.length) break
    for (const o of ops) {
      if (String(o.book || '') === TAX_BOOK) {
        skipped += 1
        continue
      }
      const st = String(o.source_type || '')
      if (!st || st.startsWith('tax_')) {
        skipped += 1
        continue
      }
      const sid = Number(o.source_id || 0)
      const entity = taxEntityCodeFromStoreName(o.store_name)
      if (!entity || sid <= 0) {
        skipped += 1
        continue
      }
      const key = twinKey(st, sid, entity)
      if (existing.has(key)) {
        skipped += 1
        continue
      }
      if (dry) {
        mirrored += 1
        existing.add(key)
        continue
      }
      const lines = (await rest(
        `journal_lines?journal_entry_id=eq.${Number(o.id)}&select=line_no,account_code,account_name,side,amount,memo,account_subject_id&order=line_no.asc`
      )) as Line[]
      const usable = (lines || []).filter((l) => Math.abs(Number(l.amount) || 0) > 0)
      if (usable.length < 2) {
        skipped += 1
        continue
      }
      try {
        const inserted = (await rest('journal_entries', {
          method: 'POST',
          body: JSON.stringify({
            entry_no: `JE-TAX-MIRROR-${o.id}`,
            accounting_date: String(o.accounting_date || '').slice(0, 10),
            source_type: st,
            source_id: sid,
            store_name: o.store_name || null,
            memo: o.memo || null,
            posted_by: o.posted_by || 'tax-mirror-backfill',
            book: TAX_BOOK,
            voucher_kind: o.voucher_kind || voucherKindForSourceType(st),
            tax_entity_code: entity,
          }),
        })) as { id?: number }[]
        const entryId = Number(inserted?.[0]?.id || 0)
        if (!entryId) throw new Error('INSERT_ENTRY_FAILED')
        await rest('journal_lines', {
          method: 'POST',
          body: JSON.stringify(
            usable.map((ln, i) => ({
              journal_entry_id: entryId,
              line_no: ln.line_no || i + 1,
              account_code: ln.account_code,
              account_name: ln.account_name,
              side: ln.side,
              amount: Math.abs(Number(ln.amount) || 0),
              memo: ln.memo || null,
              account_subject_id: ln.account_subject_id ?? null,
            }))
          ),
        })
        existing.add(key)
        mirrored += 1
      } catch (e) {
        failed += 1
        console.error('fail', o.id, st, sid, entity, e instanceof Error ? e.message : e)
      }
    }
    console.log('offset', offset, 'batch', ops.length, 'mirrored', mirrored, 'skipped', skipped, 'failed', failed)
    if (ops.length < page) break
    offset += page
  }
  console.log({ mirrored, skipped, failed, dry })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
