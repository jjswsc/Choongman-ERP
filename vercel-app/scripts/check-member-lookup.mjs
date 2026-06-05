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

async function main() {
  loadEnvLocal()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('missing supabase env')
    process.exit(1)
  }
  const sb = createClient(url, key)
  const queries = process.argv.slice(2).length ? process.argv.slice(2) : ['M007359', '3544', '0983544', 'ประวัตร']
  for (const q of queries) {
    const { data, error } = await sb
      .from('members')
      .select('id,member_no,name,full_name,phone,status,tier_code,source,point_balance')
      .or(`member_no.ilike.%${q}%,phone.ilike.%${q}%,name.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10)
    console.log('\n=== q:', q, '===')
    if (error) console.error(error.message)
    else console.log(JSON.stringify(data, null, 2))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
