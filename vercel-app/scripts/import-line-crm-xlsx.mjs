/**
 * LINE CRM Customer Report 엑셀 → members 일괄 반영
 *
 * 사용 (vercel-app 디렉터리에서):
 *   node scripts/import-line-crm-xlsx.mjs "C:\path\file.xlsx"
 */

import fs from 'fs'
import path from 'path'
import Module from 'module'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Next.js server-only 가드 우회 (CLI 전용)
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, parent, isMain)
}

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  const txt = fs.readFileSync(p, 'utf8')
  for (const line of txt.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    const k = m[1]
    if (process.env[k]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
}

async function main() {
  loadEnvLocal()

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: node scripts/import-line-crm-xlsx.mjs "<xlsx path>"')
    process.exit(1)
  }
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`)
    process.exit(1)
  }

  const modPath = path.join(__dirname, '..', 'lib', 'line-crm-import.ts')
  const { processLineCrmImport } = await import(pathToFileURL(modPath).href)

  const buf = fs.readFileSync(abs)
  const started = Date.now()
  console.log(`Importing: ${abs}`)
  console.log(`Size: ${(buf.length / 1024 / 1024).toFixed(2)} MB`)

  const result = await processLineCrmImport({
    fileName: path.basename(abs),
    fileBuffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    createdBy: 'cli-import',
  })

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(JSON.stringify(result, null, 2))
  console.log(`Done in ${elapsed}s`)

  if (!result.success) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
