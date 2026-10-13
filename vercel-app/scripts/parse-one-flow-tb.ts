import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

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

/** Flow 시산: 계정 / ยอดยกมา 차대 / ยอดประจำงวด / ยอดสะสม / รวมทั้งสิ้น */
export function parseFlowTbThai(rows: unknown[][]): {
  asOf: string
  rows: { code: string; endDebit: number; endCredit: number; net: number }[]
} {
  const asOf = cellStr(rows[2]?.[0] || '')
  const out: { code: string; endDebit: number; endCredit: number; net: number }[] = []
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || []
    const code = cellStr(row[0]).replace(/^'/, '')
    if (!/^\d{3,6}(\.\d{1,3})?$/.test(code)) continue
    // ยอดสะสม debit/credit at cols 9/10; รวมทั้งสิ้น at 12 (signed: +debit/-credit style varies)
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
    out.push({ code, endDebit, endCredit, net: endDebit - endCredit })
  }
  return { asOf, rows: out }
}

const dir = process.argv[2] || 'Jinwon_True'
const full = path.join('c:/CM_ERP/tmp-flow-zips', dir)
const target = process.argv[3] || '30 มิถุนายน 2026'
const files = fs.readdirSync(full).filter((f) => /TrialBalance/i.test(f))
for (const f of files) {
  const wb = XLSX.readFile(path.join(full, f))
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  }) as unknown[][]
  const parsed = parseFlowTbThai(sheetRows)
  if (!parsed.asOf.includes(target) && target !== '*') continue
  console.log(f.slice(-50), parsed.asOf, 'lines', parsed.rows.length)
  console.log('sample', parsed.rows.slice(0, 5))
  const inv = parsed.rows.find((r) => r.code === '11511')
  console.log('inventory 11511', inv)
  const dr = parsed.rows.reduce((s, r) => s + r.endDebit, 0)
  const cr = parsed.rows.reduce((s, r) => s + r.endCredit, 0)
  console.log('TB sum dr/cr/diff', dr, cr, dr - cr)
}
