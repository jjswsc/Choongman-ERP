/**
 * S&J Global 세무 장부 기초 전표 1회 전기 (REST).
 * 사용: npx tsx scripts/post-sj-tax-opening.ts
 * 재고 지정: npx tsx scripts/post-sj-tax-opening.ts 1234567.89
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  buildTaxOpeningBalanceLines,
  SJ_GLOBAL_FLOW_TB_2026_06_30,
  SJ_GLOBAL_OPENING_DATE,
  SJ_GLOBAL_TAX_ENTITY,
} from '../lib/tax-book-opening'
import { accountLine } from '../lib/chart-of-accounts-mapping'
import { TAX_BOOK, voucherKindForSourceType } from '../lib/tax-book'

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
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
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function loadInventory(asOf: string): Promise<number> {
  const asOfIso = `${asOf}T23:59:59.999+07:00`
  const patterns = ['%CM Office%', '%S&J%', '%S and J%', '%SNJ%', '%HQ%']
  let qtyByItem: Record<string, number> = {}
  try {
    const rows = (await fetch(`${url}/rest/v1/rpc/get_store_stock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_location_patterns: patterns, p_as_of_date: asOfIso }),
    }).then(async (r) => {
      const t = await r.text()
      if (!r.ok) throw new Error(t)
      return JSON.parse(t)
    })) as { item_code?: string; total_qty?: number }[]
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      qtyByItem[code] = Number(r.total_qty ?? 0)
    }
  } catch {
    const loc = `or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
    const logs = (await rest(
      `stock_logs?select=item_code,qty&${loc}&log_date=lte.${encodeURIComponent(asOfIso)}&limit=200000`
    )) as { item_code?: string; qty?: number }[]
    qtyByItem = {}
    for (const r of logs || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      qtyByItem[code] = (qtyByItem[code] || 0) + (Number(r.qty) || 0)
    }
  }
  const items = (await rest('items?select=code,cost,price&limit=100000')) as {
    code?: string
    cost?: number | null
    price?: number | null
  }[]
  const costMap: Record<string, number> = {}
  for (const it of items || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    const c = Number(it.cost)
    const p = Number(it.price)
    costMap[code] = Number.isFinite(c) && c > 0 ? c : Number.isFinite(p) && p > 0 ? p : 0
  }
  let amount = 0
  for (const [code, qty] of Object.entries(qtyByItem)) {
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) continue
    amount += qty * (costMap[code] || 0)
  }
  return Math.round(amount * 100) / 100
}

async function main() {
  const arg = process.argv[2]
  let inventoryAmount: number
  let inventorySource: string
  if (arg != null && arg !== '' && Number.isFinite(Number(arg))) {
    inventoryAmount = Number(arg)
    inventorySource = 'cli'
  } else {
    inventoryAmount = await loadInventory('2026-06-30')
    inventorySource = 'erp'
  }

  const built = buildTaxOpeningBalanceLines({
    rows: SJ_GLOBAL_FLOW_TB_2026_06_30,
    inventoryAmount,
  })
  const sourceId = 20260701
  const sourceType = 'tax_opening'
  console.log({
    taxEntity: SJ_GLOBAL_TAX_ENTITY,
    date: SJ_GLOBAL_OPENING_DATE,
    inventoryAmount,
    inventorySource,
    flowInventory: built.flowInventory,
    inventoryDelta: built.inventoryDelta,
    lineCount: built.lines.length,
  })

  const existing = (await rest(
    `journal_entries?select=id&source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${sourceId}&book=eq.${TAX_BOOK}&tax_entity_code=eq.${encodeURIComponent(SJ_GLOBAL_TAX_ENTITY)}`
  )) as { id?: number }[]
  const oldIds = (existing || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  if (oldIds.length) {
    const idList = oldIds.join(',')
    await rest(`journal_lines?journal_entry_id=in.(${idList})`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } })
    await rest(`journal_entries?id=in.(${idList})`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } })
    console.log('replaced previous opening entries', oldIds)
  }

  const entryNo = `JE-OPEN-${SJ_GLOBAL_OPENING_DATE}-${sourceId}`
  const inserted = (await rest('journal_entries', {
    method: 'POST',
    body: JSON.stringify({
      entry_no: entryNo,
      accounting_date: SJ_GLOBAL_OPENING_DATE,
      source_type: sourceType,
      source_id: sourceId,
      store_name: SJ_GLOBAL_TAX_ENTITY,
      memo: `FlowAccount→세무 기초 ${SJ_GLOBAL_OPENING_DATE} (재고 ${inventorySource} ${inventoryAmount})`,
      posted_by: 'opening-script',
      book: TAX_BOOK,
      voucher_kind: voucherKindForSourceType(sourceType),
      tax_entity_code: SJ_GLOBAL_TAX_ENTITY,
    }),
  })) as { id?: number }[]
  const entryId = Number(inserted?.[0]?.id || 0)
  if (!entryId) throw new Error('INSERT_ENTRY_FAILED')

  await rest('journal_lines', {
    method: 'POST',
    body: JSON.stringify(
      built.lines.map((ln, i) => {
        const meta = accountLine(ln.accountCode)
        return {
          journal_entry_id: entryId,
          line_no: i + 1,
          account_code: ln.accountCode,
          account_name: ln.accountName || meta.accountName,
          side: ln.side,
          amount: ln.amount,
          memo: null,
        }
      })
    ),
  })
  console.log('entryId', entryId, 'ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
