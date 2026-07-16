/**
 * I'm ICE 중복 — M012889 (#12889) → M012890 (#12890)
 * Usage: node scripts/run-merge-im-ice.cjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mergeMembers } from '../lib/member-merge-server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGET_ID = 12890
const SOURCE_ID = 12889

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

async function main() {
  loadEnvLocal()
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }

  console.log(`Merging source #${SOURCE_ID} → target #${TARGET_ID} ...`)
  const result = await mergeMembers({
    targetMemberId: TARGET_ID,
    sourceMemberId: SOURCE_ID,
    actor: 'script:im-ice-line-shell-merge',
  })
  console.log('merge result:', JSON.stringify(result, null, 2))
  console.log('done — keep M012890 (#12890), inactive M012889 (#12889)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
