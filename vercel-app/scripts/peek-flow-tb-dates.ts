import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const root = 'c:/CM_ERP/tmp-flow-zips'
for (const dir of fs.readdirSync(root)) {
  const full = path.join(root, dir)
  if (!fs.statSync(full).isDirectory()) continue
  console.log('\n##', dir)
  for (const f of fs.readdirSync(full).filter((x) => /TrialBalance/i.test(x))) {
    const wb = XLSX.readFile(path.join(full, f))
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
    }) as unknown[][]
    const dateLine = String(rows[2]?.[0] || rows[1]?.[0] || '')
    const n = rows.filter((r) => /^\d{3,}/.test(String(r?.[0] || ''))).length
    console.log(dateLine, '| accounts~', n, '|', f.slice(-55), '| size', fs.statSync(path.join(full, f)).size)
  }
}
