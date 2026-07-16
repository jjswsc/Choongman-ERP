/**
 * LINE import 생년월일 2건 중복 — 후보 CSV 추출 + 고신뢰도 일괄 병합
 *
 * Usage:
 *   node scripts/run-merge-line-import-birth-duplicates.cjs --export-csv
 *   node scripts/run-merge-line-import-birth-duplicates.cjs --dry-run
 *   node scripts/run-merge-line-import-birth-duplicates.cjs --apply --min-score 6
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { canonicalMemberPhoneForStorage } from '../lib/member-phone-lookup'
import {
  LINE_IMPORT_AUTO_MERGE_MIN_SCORE,
  buildLineImportBirthDuplicateCandidates,
  dedupeMergeJobs,
  type LineImportMergeCandidateMember,
} from '../lib/line-import-merge-candidates'
import { mergeMembers } from '../lib/member-merge-server'
import { recalculateMemberTier } from '../lib/members-server-points'
import { supabaseUpdateByFilter } from '../lib/supabase-server'
import { getBangkokDateTimeString } from '../lib/bangkok-time'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const exportCsv = args.includes('--export-csv') || args.includes('--dry-run') || args.includes('--apply')
const dryRun = args.includes('--dry-run')
const apply = args.includes('--apply')
const minScoreArg = args.find((a) => a.startsWith('--min-score='))
const minScore = minScoreArg
  ? Math.max(0, Number(minScoreArg.split('=')[1] || LINE_IMPORT_AUTO_MERGE_MIN_SCORE))
  : apply
    ? LINE_IMPORT_AUTO_MERGE_MIN_SCORE
    : 0

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

async function fetchActiveMembers(): Promise<LineImportMergeCandidateMember[]> {
  loadEnvLocal()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key)
  const rows: LineImportMergeCandidateMember[] = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('members')
      .select(
        'id,member_no,name,full_name,line_display_name,phone,birth_date,tier_code,point_balance,tier_points,source,status'
      )
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as LineImportMergeCandidateMember[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function fetchLineIdentityMemberIds(): Promise<Set<number>> {
  loadEnvLocal()
  const sb = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const ids = new Set<number>()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('member_identities')
      .select('member_id')
      .eq('provider', 'line')
      .eq('status', 'active')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      const id = Number(row.member_id || 0)
      if (id > 0) ids.add(id)
    }
    if (data.length < 1000) break
    from += 1000
  }
  return ids
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(filePath: string, rows: ReturnType<typeof buildLineImportBirthDuplicateCandidates>) {
  const header = [
    'score',
    'reason',
    'birth_date',
    'target_id',
    'target_member_no',
    'target_phone',
    'target_name',
    'target_points',
    'target_has_line',
    'source_id',
    'source_member_no',
    'source_phone',
    'source_name',
    'source_points',
    'source_has_line',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.score,
        r.reason,
        r.birthDate,
        r.targetId,
        r.targetMemberNo,
        r.targetPhone,
        r.targetName,
        r.targetPoints,
        r.targetHasLine ? 'Y' : 'N',
        r.sourceId,
        r.sourceMemberNo,
        r.sourcePhone,
        r.sourceName,
        r.sourcePoints,
        r.sourceHasLine ? 'Y' : 'N',
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
}

async function main() {
  const [members, lineIds] = await Promise.all([fetchActiveMembers(), fetchLineIdentityMemberIds()])
  const allCandidates = dedupeMergeJobs(
    buildLineImportBirthDuplicateCandidates(members, lineIds, { minScore: 0, pairOnly: true })
  )
  const filtered = allCandidates.filter((c) => c.score >= minScore)
  const autoCandidates = allCandidates.filter(
    (c) => c.score >= LINE_IMPORT_AUTO_MERGE_MIN_SCORE && !c.reason.includes('review_only')
  )
  const manualReview = allCandidates.filter((c) => c.reason.includes('review_only'))

  console.log(`active members: ${members.length}`)
  console.log(`line identities: ${lineIds.size}`)
  console.log(`pair candidates (score>=0): ${allCandidates.length}`)
  console.log(`filtered (score>=${minScore}): ${filtered.length}`)
  console.log(`auto-merge threshold (score>=${LINE_IMPORT_AUTO_MERGE_MIN_SCORE}, names match): ${autoCandidates.length}`)
  console.log(`manual review queue (score 6-8, same birth+LINE only): ${manualReview.length}`)

  const outDir = path.join(__dirname, 'output')
  const csvAll = path.join(outDir, 'line-import-merge-candidates-all.csv')
  const csvManual = path.join(outDir, 'line-import-merge-manual-review.csv')

  const csvFiltered = path.join(outDir, `line-import-merge-candidates-min${minScore}.csv`)

  if (exportCsv || !apply) {
    writeCsv(csvAll, allCandidates)
    writeCsv(csvFiltered, filtered)
    writeCsv(csvManual, manualReview)
    console.log(`CSV: ${csvAll}`)
    console.log(`CSV: ${csvFiltered}`)
    console.log(`CSV (manual review): ${csvManual}`)
  } else {
    writeCsv(csvAll, allCandidates)
    writeCsv(csvManual, manualReview)
  }

  const jobs = apply ? autoCandidates : dryRun ? filtered : []

  if (dryRun && jobs.length > 0) {
    console.log(`\n--- dry-run merge preview (first 30) ---`)
    for (const job of jobs.slice(0, 30)) {
      console.log(
        `[${job.score}] KEEP #${job.targetId} ${job.targetPhone} ${job.targetName} <- MERGE #${job.sourceId} ${job.sourcePhone} ${job.sourceName} (${job.reason})`
      )
    }
    if (jobs.length > 30) console.log(`... and ${jobs.length - 30} more`)
  }

  if (!apply) {
    if (!dryRun && !exportCsv) {
      console.log('Hint: --export-csv | --dry-run | --apply --min-score=6')
    }
    return
  }

  let ok = 0
  let fail = 0
  const mergedTargetIds = new Set<number>()

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!
    try {
      await mergeMembers({
        targetMemberId: job.targetId,
        sourceMemberId: job.sourceId,
        actor: 'script:merge-line-import-birth-duplicates',
      })
      const canonical = canonicalMemberPhoneForStorage(job.targetPhone)
      if (canonical) {
        await supabaseUpdateByFilter('members', `id=eq.${job.targetId}`, {
          phone: canonical,
          updated_at: getBangkokDateTimeString(),
        })
      }
      mergedTargetIds.add(job.targetId)
      ok += 1
      if ((i + 1) % 20 === 0 || i + 1 === jobs.length) {
        console.log(`merge progress ${i + 1}/${jobs.length} ok=${ok} fail=${fail}`)
      }
    } catch (e) {
      fail += 1
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`FAIL target=${job.targetId} source=${job.sourceId}: ${msg}`)
    }
  }

  console.log(`merge done ok=${ok} fail=${fail}`)
  console.log(`recalculating tier for ${mergedTargetIds.size} targets...`)
  let tierOk = 0
  for (const id of mergedTargetIds) {
    try {
      await recalculateMemberTier(id)
      tierOk += 1
    } catch {
      // ignore individual tier failures
    }
  }
  console.log(`tier recalc ok=${tierOk}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
