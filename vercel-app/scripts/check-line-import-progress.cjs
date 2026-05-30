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
  const members = await sb.from('members').select('id', { count: 'exact', head: true }).eq('source', 'line_import')
  console.log('line_import members:', members.count, members.error?.message || '')
  const withLine = await sb.from('members').select('id', { count: 'exact', head: true }).not('line_display_name', 'is', null)
  console.log('members with line_display_name:', withLine.count, withLine.error?.message || '')
  const jobs = await sb.from('line_import_jobs').select('*').order('created_at', { ascending: false }).limit(1)
  console.log('latest job:', JSON.stringify(jobs.data?.[0] || null, null, 2))
  const rows = await sb.from('line_import_rows').select('id', { count: 'exact', head: true }).eq('job_id', jobs.data?.[0]?.id || 'none')
  console.log('import rows logged for latest job:', rows.count, rows.error?.message || '')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
