/**
 * node scripts/probe-marketing-tables.cjs
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

async function sb(qs) {
  const res = await fetch(`${url}/rest/v1/${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const text = await res.text()
  return { status: res.status, text: text.slice(0, 400) }
}

;(async () => {
  const tables = {}
  for (const t of ["marketing_tiktok_connections", "marketing_meta_connections"]) {
    tables[t] = await sb(`${t}?select=id&limit=1`)
  }
  const camps = await sb(
    "marketing_campaigns?status=eq.ongoing&select=id,topic,budget_total,meta_campaign_id,meta_campaign_name&order=id.desc&limit=10"
  )
  const inflCols = await sb("marketing_influencers?select=id,campaign_id,actual_cost,budget&limit=3")
  console.log(
    JSON.stringify(
      {
        tables,
        campaigns: camps,
        influencers: inflCols,
        tiktokEnv: {
          appId: Boolean(env.TIKTOK_APP_ID),
          appSecret: Boolean(env.TIKTOK_APP_SECRET),
          tokenEnc: Boolean(env.TIKTOK_TOKEN_ENCRYPTION_KEY || env.META_TOKEN_ENCRYPTION_KEY),
        },
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
