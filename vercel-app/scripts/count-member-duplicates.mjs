import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function canonicalPhone(phone) {
  let digits = String(phone || '').replace(/[^\d]/g, '')
  if (digits.startsWith('66') && digits.length >= 11) digits = `0${digits.slice(2)}`
  else if (/^\d{9}$/.test(digits)) digits = `0${digits}`
  return digits
}

async function fetchAllActive() {
  loadEnvLocal()
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('members')
      .select('id,member_no,name,full_name,phone,birth_date,tier_code,point_balance,source,status,line_display_name')
      .eq('status', 'active')
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
  const active = await fetchAllActive()
  console.log('active members:', active.length)

  // same birth_date, different canonical phone
  const byBirth = new Map()
  for (const m of active) {
    const bd = String(m.birth_date || '').trim()
    if (!bd) continue
    const phone = canonicalPhone(String(m.phone || ''))
    if (!phone) continue
    if (!byBirth.has(bd)) byBirth.set(bd, [])
    byBirth.get(bd).push(m)
  }
  let birthDupGroups = 0
  let birthDupMembers = 0
  for (const [, arr] of byBirth) {
    const phones = new Set(arr.map((m) => canonicalPhone(String(m.phone || ''))))
    if (phones.size > 1) {
      birthDupGroups += 1
      birthDupMembers += arr.length
    }
  }

  // same canonical phone duplicates
  const byPhone = new Map()
  for (const m of active) {
    const phone = canonicalPhone(String(m.phone || ''))
    if (!phone) continue
    if (!byPhone.has(phone)) byPhone.set(phone, [])
    byPhone.get(phone).push(m)
  }
  let phoneDupGroups = 0
  let phoneDupMembers = 0
  for (const [, arr] of byPhone) {
    if (arr.length > 1) {
      phoneDupGroups += 1
      phoneDupMembers += arr.length
    }
  }

  // line_import same birth 2+
  const lineImportByBirth = new Map()
  for (const m of active) {
    if (String(m.source || '') !== 'line_import') continue
    const bd = String(m.birth_date || '').trim()
    if (!bd) continue
    if (!lineImportByBirth.has(bd)) lineImportByBirth.set(bd, [])
    lineImportByBirth.get(bd).push(m)
  }
  let lineImportBirthGroups = 0
  let lineImportBirthMembers = 0
  for (const [, arr] of lineImportByBirth) {
    if (arr.length >= 2) {
      lineImportBirthGroups += 1
      lineImportBirthMembers += arr.length
    }
  }

  console.log('\n=== duplicate summary ===')
  console.log('same birth_date + different phones (groups / members):', birthDupGroups, '/', birthDupMembers)
  console.log('same phone duplicates (groups / members):', phoneDupGroups, '/', phoneDupMembers)
  console.log('line_import same birth_date 2+ (groups / members):', lineImportBirthGroups, '/', lineImportBirthMembers)

  // top 5 birth dup examples
  const examples = []
  for (const [bd, arr] of byBirth) {
    const phones = new Set(arr.map((m) => canonicalPhone(String(m.phone || ''))))
    if (phones.size > 1) examples.push({ birth: bd, members: arr })
  }
  examples.sort((a, b) => b.members.length - a.members.length)
  console.log('\n=== top birth-date dup examples (max 8) ===')
  for (const ex of examples.slice(0, 8)) {
    console.log(
      ex.birth,
      ex.members.map((m) => `#${m.id} ${m.phone} ${m.name || m.full_name} ${m.tier_code} pts=${m.point_balance}`).join(' | ')
    )
  }

  // Kongphop-style: exactly 2 line_import rows, same birth, different phones
  let pairGroups = 0
  for (const [, arr] of lineImportByBirth) {
    if (arr.length !== 2) continue
    const phones = new Set(arr.map((m) => canonicalPhone(String(m.phone || ''))))
    if (phones.size === 2) pairGroups += 1
  }
  console.log('\nline_import same birth exactly-2 different-phone pairs (Kongphop-style):', pairGroups)

  // 3+ on same birth from line_import only
  let triplePlus = 0
  for (const [, arr] of lineImportByBirth) {
    if (arr.length >= 3) triplePlus += 1
  }
  console.log('line_import same birth 3+ members (likely different people):', triplePlus, 'groups')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
