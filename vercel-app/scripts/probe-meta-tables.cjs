/**
 * Probe Meta tables + optionally note missing DDL. Does not print secrets.
 * Usage: node scripts/probe-meta-tables.cjs
 * Reads vercel-app/.env.local
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[line.slice(0, i).trim()] = v
  }
  return out
}

const envPath = path.join(__dirname, "..", ".env.local")
if (!fs.existsSync(envPath)) {
  console.log(JSON.stringify({ ok: false, reason: "no_env_local" }))
  process.exit(0)
}
const env = loadEnv(envPath)
const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "")
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: "missing_supabase" }))
  process.exit(0)
}

async function probe(table, select) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const body = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    hint: res.ok ? undefined : body.slice(0, 160),
  }
}

;(async () => {
  const connections = await probe("marketing_meta_connections", "id")
  const campaignsMeta = await probe("marketing_campaigns", "id,meta_campaign_id,meta_campaign_name")
  const campaignsBase = campaignsMeta.ok
    ? campaignsMeta
    : await probe("marketing_campaigns", "id")
  console.log(
    JSON.stringify(
      {
        marketing_meta_connections: connections,
        marketing_campaigns: campaignsBase,
        meta_campaign_columns: campaignsMeta.ok,
        need_connections_sql: !connections.ok,
        need_campaign_map_sql: campaignsBase.ok && !campaignsMeta.ok,
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
