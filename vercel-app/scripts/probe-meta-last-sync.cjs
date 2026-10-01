/**
 * node scripts/probe-meta-last-sync.cjs
 */
const fs = require("fs")
const path = require("path")

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8")
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const i = line.indexOf("=")
    if (i < 0) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

const env = loadEnv(path.join(__dirname, "..", ".env.local"))
const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "")
const key = env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: "missing_supabase" }))
  process.exit(1)
}

;(async () => {
  const res = await fetch(
    `${url}/rest/v1/marketing_meta_connections?select=page_name,ad_account_id,last_synced_at,last_sync_json&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )
  const rows = await res.json()
  const row = Array.isArray(rows) ? rows[0] : null
  const j = row?.last_sync_json || {}
  console.log(
    JSON.stringify(
      {
        page: row?.page_name,
        adAccountId: row?.ad_account_id,
        lastSyncedAt: row?.last_synced_at,
        ads: Array.isArray(j.ads) ? j.ads.length : 0,
        adsTotals: j.adsTotals || null,
        diagnostics: j.diagnostics || [],
        grants: j.grantedScopes || [],
        dateRange: j.dateRange || null,
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
