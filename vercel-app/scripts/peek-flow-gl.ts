import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const dir = process.argv[2] || 'ACT_Future'
const full = path.join('c:/CM_ERP/tmp-flow-zips', dir)
const f = fs.readdirSync(full).find((x) => /_GL_/i.test(x))
if (!f) {
  console.error('no GL')
  process.exit(1)
}
console.log('file', f)
const wb = XLSX.readFile(path.join(full, f))
console.log('sheets', wb.SheetNames)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }) as unknown[][]
console.log('nrows', rows.length)
for (let i = 0; i < Math.min(15, rows.length); i++) console.log(i, JSON.stringify(rows[i]).slice(0, 300))
