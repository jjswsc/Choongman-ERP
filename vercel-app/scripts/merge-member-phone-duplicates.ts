/**
 * 동일 전화번호(선행 0·66 표기 차이) 중복 회원 일괄 병합 — 최신 id 유지
 * Usage: node scripts/run-merge-phone-duplicates.cjs [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { canonicalPhoneDedupeKey, canonicalMemberPhoneForStorage } from '../lib/member-phone-lookup'
import { mergeMembers } from '../lib/member-merge-server'
import { supabaseUpdateByFilter } from '../lib/supabase-server'
import { getBangkokDateTimeString } from '../lib/bangkok-time'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

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

type MemberRow = {
  id: number
  member_no?: string | null
  phone?: string | null
  status?: string | null
  source?: string | null
  created_at?: string | null
  updated_at?: string | null
}

async function fetchAllActiveMembers() {
  loadEnvLocal()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)
  const rows: MemberRow[] = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await sb
      .from('members')
      .select('id,member_no,phone,status,source,created_at,updated_at')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as MemberRow[]))
    if (data.length < page) break
    from += page
  }
  return rows
}

function buildMergePlan(active: MemberRow[]) {
  const byKey = new Map<string, MemberRow[]>()
  for (const m of active) {
    const key = canonicalPhoneDedupeKey(String(m.phone || ''))
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(m)
  }
  const jobs: Array<{ targetId: number; sourceId: number; phoneKey: string }> = []
  for (const [phoneKey, arr] of byKey.entries()) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => Number(b.id) - Number(a.id))
    const target = sorted[0]!
    for (const source of sorted.slice(1)) {
      jobs.push({ phoneKey, targetId: Number(target.id), sourceId: Number(source.id) })
    }
  }
  return jobs
}

async function main() {
  const active = await fetchAllActiveMembers()
  const jobs = buildMergePlan(active)
  console.log(`active members: ${active.length}`)
  console.log(`merge jobs: ${jobs.length}${dryRun ? ' (dry-run)' : ''}`)

  if (dryRun) {
    for (const job of jobs.slice(0, 20)) {
      console.log(`KEEP ${job.targetId} <- MERGE ${job.sourceId} (${job.phoneKey})`)
    }
    if (jobs.length > 20) console.log(`... and ${jobs.length - 20} more`)
    return
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!
    try {
      await mergeMembers({
        targetMemberId: job.targetId,
        sourceMemberId: job.sourceId,
        actor: 'script:merge-phone-duplicates',
      })
      const canonical = canonicalMemberPhoneForStorage(job.phoneKey)
      if (canonical) {
        await supabaseUpdateByFilter('members', `id=eq.${job.targetId}`, {
          phone: canonical,
          updated_at: getBangkokDateTimeString(),
        })
      }
      ok += 1
      if ((i + 1) % 50 === 0 || i + 1 === jobs.length) {
        console.log(`progress ${i + 1}/${jobs.length} ok=${ok} fail=${fail}`)
      }
    } catch (e) {
      fail += 1
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`FAIL target=${job.targetId} source=${job.sourceId} (${job.phoneKey}): ${msg}`)
    }
  }
  console.log(`done ok=${ok} fail=${fail}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
