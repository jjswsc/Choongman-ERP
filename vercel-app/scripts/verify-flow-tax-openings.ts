/**
 * Flow 기초 전표 vs 원본 시산 대사
 * npx tsx scripts/verify-flow-tax-openings.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import {
  buildTaxOpeningBalanceLines,
  mapFlowAccountCodeToErp,
  type ExternalTrialBalanceRow,
} from '../lib/tax-book-opening'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('missing env')
  process.exit(1)
}
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function rest(p: string) {
  const res = await fetch(`${url}/rest/v1/${encodeURI(p)}`, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}
function cellNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = cellStr(v).replace(/,/g, '')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function parseFlowTbThai(rows: unknown[][]): ExternalTrialBalanceRow[] {
  const out: ExternalTrialBalanceRow[] = []
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || []
    const code = cellStr(row[0]).replace(/^'/, '')
    if (!/^\d{3,6}(\.\d{1,3})?$/.test(code)) continue
    if (!/^[123]/.test(code)) continue
    const ytdDr = cellNum(row[9])
    const ytdCr = cellNum(row[10])
    const total = cellNum(row[12])
    let endDebit = 0
    let endCredit = 0
    if (ytdDr > 0.005 || ytdCr > 0.005) {
      endDebit = ytdDr
      endCredit = ytdCr
    } else if (Math.abs(total) > 0.005) {
      if (total > 0) endDebit = total
      else endCredit = -total
    }
    if (endDebit < 0.005 && endCredit < 0.005) continue
    out.push({ code, endDebit, endCredit })
  }
  return out
}

function findJune30Tb(dir: string): ExternalTrialBalanceRow[] | null {
  const full = path.join('c:/CM_ERP/tmp-flow-zips', dir)
  if (!fs.existsSync(full)) return null
  const files = fs.readdirSync(full).filter((f) => /TrialBalance/i.test(f))
  let best: ExternalTrialBalanceRow[] | null = null
  for (const f of files) {
    const wb = XLSX.readFile(path.join(full, f))
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    }) as unknown[][]
    const asOf = cellStr(sheetRows[2]?.[0] || '')
    if (!asOf.includes('30 มิถุนายน 2026')) continue
    const parsed = parseFlowTbThai(sheetRows)
    if (!best || parsed.length > best.length) best = parsed
  }
  return best
}

const JOBS = [
  { zip: 'Jinwon_True', key: 'tin:0105566228126', label: 'Jinwon True' },
  { zip: 'Jinwon_MBK', key: 'store:CM MBK', label: 'Jinwon MBK' },
  { zip: 'ACT_Silom', key: 'tin:0105568080622', label: 'ACT Silom' },
  { zip: 'ACT_Future', key: 'store:CM Future Park', label: 'ACT Future', glOnly: true },
  { zip: 'ACT_Ekkamai', key: 'store:CM Ekkamai', label: 'ACT Ekkamai', glOnly: true },
  { zip: 'SJ_01-06', key: 'tin:0105566137147', label: 'S&J' },
]

async function main() {
  const heads = (await rest(
    'journal_entries?select=id,tax_entity_code,accounting_date,memo&source_type=eq.tax_opening&book=eq.tax&order=id'
  )) as { id: number; tax_entity_code: string; accounting_date: string; memo: string }[]

  console.log('DB tax_opening count', heads.length)
  for (const job of JOBS) {
    console.log('\n====', job.label, job.key, '====')
    const head = heads.find((h) => h.tax_entity_code === job.key)
    if (!head) {
      console.log('MISSING opening in DB')
      continue
    }
    const lines = (await rest(
      `journal_lines?select=account_code,side,amount&journal_entry_id=eq.${head.id}&order=line_no`
    )) as { account_code: string; side: string; amount: number }[]
    const erpByCode: Record<string, number> = {}
    let dr = 0
    let cr = 0
    for (const ln of lines) {
      const amt = Number(ln.amount) || 0
      const signed = ln.side === 'credit' ? -amt : amt
      erpByCode[ln.account_code] = (erpByCode[ln.account_code] || 0) + signed
      if (ln.side === 'credit') cr += amt
      else dr += amt
    }
    console.log('entry', head.id, head.accounting_date, 'lines', lines.length, 'balanced', Math.abs(dr - cr) < 0.02)

    const tb = findJune30Tb(job.zip)
    if (!tb) {
      console.log('no June30 TB in zip (GL-based or verify-only)')
      console.log(
        'ERP nets',
        Object.entries(erpByCode)
          .map(([c, n]) => `${c}:${n.toFixed(2)}`)
          .join(' | ')
      )
      continue
    }
    const inv = tb.find((r) => r.code === '11511')
    const invAmt = inv ? Math.max(0, inv.endDebit - inv.endCredit) : 0
    const expected = buildTaxOpeningBalanceLines({ rows: tb, inventoryAmount: invAmt })
    const expByCode: Record<string, number> = {}
    for (const ln of expected.lines) {
      expByCode[ln.accountCode] = (expByCode[ln.accountCode] || 0) + (ln.side === 'credit' ? -ln.amount : ln.amount)
    }
    const codes = [...new Set([...Object.keys(erpByCode), ...Object.keys(expByCode)])].sort()
    let mismatches = 0
    for (const c of codes) {
      const a = Math.round((erpByCode[c] || 0) * 100) / 100
      const b = Math.round((expByCode[c] || 0) * 100) / 100
      if (Math.abs(a - b) > 1) {
        mismatches += 1
        console.log(' MISMATCH', c, 'erp', a, 'expected', b, 'delta', a - b)
      }
    }
    if (!mismatches) console.log('OK matches rebuilt opening from Flow TB (mapped ERP codes)')
    else console.log('mismatch count', mismatches)

    // raw Flow cash vs mapped 1010
    let flowCash = 0
    for (const r of tb) {
      if (/^111/.test(r.code)) flowCash += r.endDebit - r.endCredit
    }
    console.log('Flow cash(111*) net', flowCash.toFixed(2), 'ERP 1010', (erpByCode['1010'] || 0).toFixed(2))
    console.log('Flow AR(113*)', tb.filter((r) => /^113/.test(r.code)).reduce((s, r) => s + r.endDebit - r.endCredit, 0).toFixed(2), 'ERP 1130', (erpByCode['1130'] || 0).toFixed(2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
