/**
 * 잘못된 LINE import 찌꺼기 비활성: name='-' + 유효하지 않은 짧은 전화번호
 * Usage: node scripts/deactivate-junk-line-import-members.mjs [--dry-run]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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

function bangkokNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ')
}

function digitPhone(p) {
  return String(p || '').replace(/[^0-9]/g, '')
}

function isValidThaiMobile(phone) {
  let d = digitPhone(phone)
  if (d.startsWith('66') && d.length >= 11) d = `0${d.slice(2)}`
  if (/^\d{9}$/.test(d)) d = `0${d}`
  return /^0[689]\d{8}$/.test(d)
}

async function main() {
  loadEnvLocal()
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('members')
      .select('id,member_no,name,phone,source,point_balance,status')
      .eq('status', 'active')
      .eq('source', 'line_import')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const junk = rows.filter((r) => {
    const name = String(r.name || '').trim()
    const phoneOk = isValidThaiMobile(r.phone)
    const dashName = name === '-' || name === '' || name === '.'
    const points = Number(r.point_balance || 0)
    return dashName && !phoneOk && points === 0
  })

  console.log('line_import active scanned:', rows.length)
  console.log('junk to deactivate:', junk.length, dryRun ? '(dry-run)' : '')
  for (const j of junk.slice(0, 20)) {
    console.log(`${j.id}:${j.member_no}:name=${j.name}:phone=${j.phone}`)
  }
  if (junk.length > 20) console.log(`... +${junk.length - 20}`)
  if (dryRun) return

  const now = bangkokNow()
  let ok = 0
  for (const j of junk) {
    const { error } = await sb
      .from('members')
      .update({
        status: 'inactive',
        phone: null,
        updated_at: now,
      })
      .eq('id', j.id)
    if (error) {
      console.error('FAIL', j.id, error.message)
      continue
    }
    ok++
    if (ok % 50 === 0) console.log(`progress ${ok}/${junk.length}`)
  }
  console.log(`done deactivated=${ok}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
