const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

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
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const table = await sb.from('member_login_otps').select('id', { count: 'exact', head: true })
  console.log('member_login_otps exists:', table.error ? table.error.message : `yes (${table.count} rows)`)
  const smsKeys = Object.keys(process.env).filter((k) => /SMS|OTP|TWILIO|THAI|MEMBER_OTP/i.test(k))
  console.log('sms-related env keys:', smsKeys.join(', ') || '(none)')
}

main().catch(console.error)
