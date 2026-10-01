/** List Meta connection + campaigns mapping (no secrets). */
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: "missing_supabase" }))
  process.exit(0)
}

async function get(pathQs) {
  const res = await fetch(`${url}/rest/v1/${pathQs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  })
  const body = await res.json().catch(() => [])
  return { status: res.status, count: res.headers.get("content-range"), rows: body }
}

;(async () => {
  const conn = await get(
    "marketing_meta_connections?select=id,page_id,page_name,ad_account_id,last_synced_at,token_kind&order=updated_at.desc&limit=3"
  )
  const camps = await get(
    "marketing_campaigns?select=id,topic,status,start_date,end_date,meta_campaign_id,meta_campaign_name&order=id.desc&limit=20"
  )
  const connRows = Array.isArray(conn.rows) ? conn.rows : []
  const campRows = Array.isArray(camps.rows) ? camps.rows : []
  const mapped = campRows.filter(
    (r) => String(r.meta_campaign_id || "").trim() || String(r.meta_campaign_name || "").trim()
  )
  const connected = connRows.some((r) => String(r.page_id || "").trim())
  console.log(
    JSON.stringify(
      {
        connected,
        connStatus: conn.status,
        campsStatus: camps.status,
        campsError: Array.isArray(camps.rows) ? null : camps.rows,
        connections: connRows.map((r) => ({
          id: r.id,
          pageId: r.page_id || null,
          pageName: r.page_name || null,
          adAccountId: r.ad_account_id ? "set" : "",
          lastSyncedAt: r.last_synced_at,
        })),
        campaignSample: campRows.slice(0, 8).map((r) => ({
          id: r.id,
          topic: r.topic,
          status: r.status,
          mapped: Boolean(String(r.meta_campaign_id || "").trim() || String(r.meta_campaign_name || "").trim()),
          metaCampaignName: r.meta_campaign_name || "",
        })),
        mappedCount: mapped.length,
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
