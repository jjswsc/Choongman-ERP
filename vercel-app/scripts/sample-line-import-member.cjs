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
  const sample = await sb
    .from('members')
    .select(
      'id,full_name,phone,line_display_name,line_current_points,line_total_points,line_membership_tier,line_member_branch,line_registered_at,point_balance,tier_code,updated_at'
    )
    .not('line_display_name', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(3)
  console.log(JSON.stringify(sample.data, null, 2))
  if (sample.error) console.error(sample.error)
}

main().catch(console.error)
