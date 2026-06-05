/**
 * listMembers()와 동일한 PostgREST 필터로 조회 테스트
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

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

function supabaseGet(urlPath) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${base}/rest/v1/${urlPath}`,
      {
        method: 'GET',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode} ${body}`))
          else resolve(JSON.parse(body || '[]'))
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function phoneVariants(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '')
  const digits = raw.startsWith('+') ? raw.slice(1) : raw
  const out = new Set([raw, digits])
  if (digits.startsWith('66') && digits.length >= 11) {
    out.add(`0${digits.slice(2)}`)
    out.add(digits.slice(2))
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    out.add(`66${digits.slice(1)}`)
    out.add(digits.slice(1))
  }
  return [...out].filter(Boolean)
}

async function listMembersLike(q) {
  const escaped = encodeURIComponent(`*${q}*`)
  const normalizedDigits = q.replace(/[^\d+]/g, '').replace(/^\+/, '')
  const normalizedDigitsEscaped = normalizedDigits ? encodeURIComponent(`*${normalizedDigits}*`) : ''
  const memberOrClauses = [
    `name.ilike.${escaped}`,
    `full_name.ilike.${escaped}`,
    `line_display_name.ilike.${escaped}`,
    `phone.ilike.${escaped}`,
    `email.ilike.${escaped}`,
    `member_no.ilike.${escaped}`,
    `tier_code.ilike.${escaped}`,
  ]
  if (normalizedDigits && normalizedDigits !== q) {
    memberOrClauses.push(`phone.ilike.${normalizedDigitsEscaped}`)
  }
  for (const phone of phoneVariants(q)) {
    memberOrClauses.push(`phone.eq.${encodeURIComponent(phone)}`)
  }
  const memberFilter = `or=(${memberOrClauses.join(',')})`
  const path = `members?${memberFilter}&order=id.desc&limit=20&select=id,member_no,name,phone`
  console.log('filter path:', path.slice(0, 200) + '...')
  return supabaseGet(path)
}

async function main() {
  loadEnvLocal()
  for (const q of ['M007359', '0988583544', '0983544', '3544', '988583544']) {
    console.log('\n=== listMembers q:', q, '===')
    try {
      const rows = await listMembersLike(q)
      console.log('count:', rows.length, rows.map((r) => `${r.member_no} ${r.phone}`).join(' | '))
    } catch (e) {
      console.error('ERR:', e.message)
    }
  }
}

main()
