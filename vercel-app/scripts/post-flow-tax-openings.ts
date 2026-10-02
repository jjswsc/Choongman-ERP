/**
 * Flow 시산 → 세무 장부 기초 전기 (법인·매장별).
 * 같은 TIN이라도 Flow가 매장별 장부였으면 store: 키로 분리한다.
 *
 * npx tsx scripts/post-flow-tax-openings.ts --dry
 * npx tsx scripts/post-flow-tax-openings.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import {
  buildTaxOpeningBalanceLines,
  type ExternalTrialBalanceRow,
} from '../lib/tax-book-opening'
import { accountLine } from '../lib/chart-of-accounts-mapping'
import { TAX_BOOK, voucherKindForSourceType } from '../lib/tax-book'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

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

const dry = process.argv.includes('--dry')
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? String(process.argv[i + 1] || '') : ''
})()

async function rest(p: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${p}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${p}: ${text.slice(0, 500)}`)
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

function parseFlowTbThai(rows: unknown[][]): {
  asOf: string
  rows: ExternalTrialBalanceRow[]
} {
  const asOf = cellStr(rows[2]?.[0] || '')
  const out: ExternalTrialBalanceRow[] = []
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || []
    const code = cellStr(row[0]).replace(/^'/, '')
    if (!/^\d{3,6}(\.\d{1,3})?$/.test(code)) continue
    if (!/^[123]/.test(code)) continue // 재무상태만 (손익 제외)
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
  return { asOf, rows: out }
}

function findJune30Tb(dir: string): { file: string; rows: ExternalTrialBalanceRow[]; asOf: string } | null {
  const full = path.join('c:/CM_ERP/tmp-flow-zips', dir)
  if (!fs.existsSync(full)) return null
  const files = fs.readdirSync(full).filter((f) => /TrialBalance/i.test(f))
  let best: { file: string; rows: ExternalTrialBalanceRow[]; asOf: string } | null = null
  for (const f of files) {
    const wb = XLSX.readFile(path.join(full, f))
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    }) as unknown[][]
    const parsed = parseFlowTbThai(sheetRows)
    if (!parsed.asOf.includes('30 มิถุนายน 2026')) continue
    if (!best || parsed.rows.length > best.rows.length) {
      best = { file: f, rows: parsed.rows, asOf: parsed.asOf }
    }
  }
  return best
}

function parseFlowGlAsOf(dir: string, asOfYmd: string): ExternalTrialBalanceRow[] | null {
  const full = path.join('c:/CM_ERP/tmp-flow-zips', dir)
  if (!fs.existsSync(full)) return null
  const f = fs.readdirSync(full).find((x) => /_GL_/i.test(x))
  if (!f) return null
  const wb = XLSX.readFile(path.join(full, f))
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  }) as unknown[][]
  const asOf = asOfYmd // YYYY-MM-DD
  const bal = new Map<string, number>()

  const parseDate = (s: string): string | null => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
    if (!m) return null
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    return `${m[3]}-${mo}-${d}`
  }

  for (let i = 6; i < sheetRows.length; i++) {
    const row = sheetRows[i] || []
    const code = cellStr(row[0]).replace(/^'/, '')
    if (!/^\d{3,6}(\.\d{1,3})?$/.test(code)) continue
    if (!/^[123]/.test(code)) continue
    const desc = cellStr(row[7])
    const dateRaw = cellStr(row[1])
    const debit = cellNum(row[8])
    const credit = cellNum(row[9])
    const running = cellNum(row[11])

    if (desc.includes('ยอดยกมา')) {
      // opening balance signed in col11 (debit+, credit- style from samples)
      bal.set(code, running)
      continue
    }
    if (desc.includes('ยอดคงเหลือ') || !dateRaw) continue
    const ymd = parseDate(dateRaw)
    if (!ymd || ymd > asOf) continue
    const prev = bal.get(code) || 0
    bal.set(code, prev + debit - credit)
  }

  const out: ExternalTrialBalanceRow[] = []
  for (const [code, net] of [...bal.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (Math.abs(net) < 0.005) continue
    if (net > 0) out.push({ code, endDebit: net, endCredit: 0 })
    else out.push({ code, endDebit: 0, endCredit: -net })
  }
  return out
}

type Job = {
  id: string
  zipDir: string
  storeCode: string
  tin: string
  branch: string
  /** 세무 장부 키 — 매장별 Flow 분리 유지 */
  taxEntityCode: string
  label: string
}

const JOBS: Job[] = [
  {
    id: 'jinwon-true',
    zipDir: 'Jinwon_True',
    storeCode: 'CM True Digital',
    tin: '0105566228126',
    branch: '00000',
    // 법인(taxid) 조회 + 매장 조회 둘 다 되도록 tin 키에 HQ 기초를 둔다
    taxEntityCode: 'tin:0105566228126',
    label: 'Jinwon True (HQ)',
  },
  {
    id: 'jinwon-mbk',
    zipDir: 'Jinwon_MBK',
    storeCode: 'CM MBK',
    tin: '0105566228126',
    branch: '00001',
    taxEntityCode: 'store:CM MBK',
    label: 'Jinwon MBK',
  },
  {
    id: 'act-silom',
    zipDir: 'ACT_Silom',
    storeCode: 'CM Silom',
    tin: '0105568080622',
    branch: '00000',
    taxEntityCode: 'tin:0105568080622',
    label: 'ACT Silom (HQ)',
  },
  {
    id: 'act-future',
    zipDir: 'ACT_Future',
    storeCode: 'CM Future Park',
    tin: '0105568080622',
    branch: '00002',
    taxEntityCode: 'store:CM Future Park',
    label: 'ACT Future',
  },
  {
    id: 'act-ekkamai',
    zipDir: 'ACT_Ekkamai',
    storeCode: 'CM Ekkamai',
    tin: '0105568080622',
    branch: '00001',
    taxEntityCode: 'store:CM Ekkamai',
    label: 'ACT Ekkamai',
  },
  {
    id: 'sj',
    zipDir: 'SJ_01-06',
    storeCode: 'CM Office',
    tin: '0105566137147',
    branch: '00000',
    taxEntityCode: 'tin:0105566137147',
    label: 'S&J Global (verify)',
  },
]

async function postOpening(job: Job, tbRows: ExternalTrialBalanceRow[]) {
  const openingDate = '2026-07-01'
  const sourceId = 20260701
  const sourceType = 'tax_opening'
  const invRow = tbRows.find((r) => r.code === '11511')
  const flowInv = invRow ? Math.max(0, invRow.endDebit - invRow.endCredit) : 0
  // 매장 장부는 Flow 재고를 그대로 쓴다 (본사 ERP 창고와 다름)
  const inventoryAmount = flowInv
  const built = buildTaxOpeningBalanceLines({ rows: tbRows, inventoryAmount })

  console.log({
    id: job.id,
    label: job.label,
    taxEntityCode: job.taxEntityCode,
    tin: job.tin,
    inventoryAmount,
    flowInventory: built.flowInventory,
    lineCount: built.lines.length,
    dry,
  })

  if (dry) return { skipped: true as const }

  const existing = (await rest(
    `journal_entries?select=id&source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${sourceId}&book=eq.${TAX_BOOK}&tax_entity_code=eq.${encodeURIComponent(job.taxEntityCode)}`
  )) as { id?: number }[]
  const oldIds = (existing || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  if (oldIds.length) {
    const idList = oldIds.join(',')
    await rest(`journal_lines?journal_entry_id=in.(${idList})`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    })
    await rest(`journal_entries?id=in.(${idList})`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    })
    console.log('replaced', oldIds)
  }

  const entryNo = `JE-OPEN-${openingDate}-${job.id}`
  const inserted = (await rest('journal_entries', {
    method: 'POST',
    body: JSON.stringify({
      entry_no: entryNo,
      accounting_date: openingDate,
      source_type: sourceType,
      source_id: sourceId,
      store_name: job.taxEntityCode,
      memo: `FlowAccount→세무 기초 ${openingDate} ${job.label} (재고 Flow ${inventoryAmount})`,
      posted_by: 'flow-opening-script',
      book: TAX_BOOK,
      voucher_kind: voucherKindForSourceType(sourceType),
      tax_entity_code: job.taxEntityCode,
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
  return { entryId }
}

async function main() {
  const jobs = only ? JOBS.filter((j) => j.id === only || j.zipDir === only) : JOBS
  for (const job of jobs) {
    console.log('\n====', job.label, '====')
    if (job.id === 'sj') {
      const existing = await rest(
        `journal_entries?select=id,memo,accounting_date&source_type=eq.tax_opening&book=eq.tax&tax_entity_code=eq.${encodeURIComponent(job.taxEntityCode)}`
      )
      console.log('already posted (skip re-post):', existing)
      const tb = findJune30Tb(job.zipDir)
      console.log('zip June30 TB rows', tb?.rows.length, tb?.file?.slice(-40))
      continue
    }
    const tb = findJune30Tb(job.zipDir)
    let rows = tb?.rows || null
    let sourceLabel = tb ? `TB ${tb.file.slice(-40)}` : ''
    if (!rows) {
      rows = parseFlowGlAsOf(job.zipDir, '2026-06-30')
      sourceLabel = rows ? 'GL through 2026-06-30' : ''
    }
    if (!rows || !rows.length) {
      console.warn('SKIP: no June 30 TrialBalance/GL in', job.zipDir)
      continue
    }
    // 차대 검증
    const dr = rows.reduce((s, r) => s + r.endDebit, 0)
    const cr = rows.reduce((s, r) => s + r.endCredit, 0)
    console.log('using', sourceLabel, 'bs-lines', rows.length, 'dr-cr', Math.round((dr - cr) * 100) / 100)
    await postOpening(job, rows)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
