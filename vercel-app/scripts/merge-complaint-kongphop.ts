/**
 * 컴플레인 건 — ก้องภพ / Kongpop 중복 회원 병합 (11578 → 10850)
 * Usage: node scripts/run-merge-complaint-kongphop.cjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mergeMembers } from '../lib/member-merge-server'
import { recalculateMemberTier } from '../lib/members-server-points'
import { supabaseUpdateByFilter } from '../lib/supabase-server'
import { getBangkokDateTimeString } from '../lib/bangkok-time'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGET_ID = 10850
const SOURCE_ID = 11578

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
    actor: 'script:complaint-kongphop-merge',
  })
  console.log('merge result:', JSON.stringify(result, null, 2))

  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter('members', `id=eq.${TARGET_ID}`, {
    name: 'ก้องภพ',
    full_name: 'ก้องภพ',
    line_display_name: 'ก้องภพ',
    phone: '0967185451',
    updated_at: now,
  })

  const tier = await recalculateMemberTier(TARGET_ID)
  console.log('recalculated tier:', tier)
  console.log('done — target member M010850 (#10850)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
