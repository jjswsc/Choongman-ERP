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

function isUsableName(v) {
  const name = String(v || '').trim()
  if (!name) return false
  if (name === '-' || name === '.' || name === '—') return false
  return true
}

async function fetchDashMembers(sb) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('members')
      .select(
        'id,member_no,name,full_name,line_display_name,phone,source,status,point_balance,tier_points,lifetime_amount'
      )
      .eq('status', 'active')
      .eq('name', '-')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  loadEnvLocal()
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const rows = await fetchDashMembers(sb)
  console.log('active dash-name members:', rows.length)

  const rename = []
  const deactivate = []
  const keep = []

  for (const r of rows) {
    const alt =
      (isUsableName(r.line_display_name) && String(r.line_display_name).trim()) ||
      (isUsableName(r.full_name) && String(r.full_name).trim()) ||
      ''
    const phoneOk = isValidThaiMobile(r.phone)

    if (alt) {
      rename.push({ id: r.id, member_no: r.member_no, from: r.name, to: alt, phone: r.phone })
      continue
    }

    if (!phoneOk) {
      deactivate.push({ id: r.id, member_no: r.member_no, reason: 'invalid_phone', phone: r.phone })
      continue
    }

    // 유효 번호인데 표시명 없음 → 회원번호로 이름 보완 (비활성하지 않음: 재방문 조회용)
    const placeholder = `회원-${String(r.member_no || r.id).replace(/^M/i, '')}`
    rename.push({
      id: r.id,
      member_no: r.member_no,
      from: r.name,
      to: placeholder,
      phone: r.phone,
      via: 'placeholder',
    })
  }

  console.log('rename:', rename.length, '(alt name:', rename.filter((x) => x.via !== 'placeholder').length, ', placeholder:', rename.filter((x) => x.via === 'placeholder').length, ')')
  console.log('deactivate:', deactivate.length)
  console.log('keep untouched:', keep.length)

  console.log('\n--- rename sample ---')
  for (const x of rename.slice(0, 15)) console.log(`${x.member_no}: "${x.from}" -> "${x.to}" (${x.phone}) ${x.via || 'alt'}`)
  console.log('\n--- deactivate sample ---')
  for (const x of deactivate.slice(0, 15)) console.log(`${x.member_no}: ${x.reason} phone=${x.phone}`)

  if (dryRun) return

  const now = bangkokNow()
  let renamed = 0
  let deactivated = 0

  for (const x of rename) {
    const patch = {
      name: x.to,
      updated_at: now,
    }
    if (x.via !== 'placeholder') {
      // alt from line_display_name/full_name — name만 채움
    } else {
      // keep full_name empty; name is placeholder for list visibility
    }
    const { error } = await sb.from('members').update(patch).eq('id', x.id)
    if (error) {
      console.error('RENAME FAIL', x.id, error.message)
      continue
    }
    renamed++
    if (renamed % 50 === 0) console.log(`rename progress ${renamed}/${rename.length}`)
  }

  for (const x of deactivate) {
    const { error } = await sb
      .from('members')
      .update({
        status: 'inactive',
        phone: null,
        updated_at: now,
      })
      .eq('id', x.id)
    if (error) {
      console.error('DEACT FAIL', x.id, error.message)
      continue
    }
    deactivated++
    if (deactivated % 50 === 0) console.log(`deactivate progress ${deactivated}/${deactivate.length}`)
  }

  console.log(`done renamed=${renamed} deactivated=${deactivated}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
