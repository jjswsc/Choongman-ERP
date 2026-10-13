import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const full = 'c:/CM_ERP/tmp-flow-zips/Jinwon_True'
const files = fs.readdirSync(full).filter((f) => /TrialBalance/i.test(f))
console.log('files', files.length)
const f = files.sort(
  (a, b) => fs.statSync(path.join(full, b)).size - fs.statSync(path.join(full, a)).size
)[0]
console.log('pick', f)
const wb = XLSX.readFile(path.join(full, f))
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][]
console.log('nrows', rows.length)
for (let i = 0; i < Math.min(30, rows.length); i++) {
  console.log(i, JSON.stringify(rows[i]))
}
