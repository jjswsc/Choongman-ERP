/**
 * Apply Meta auto-map using last_sync_json + ongoing campaigns (service role).
 * node scripts/apply-meta-auto-map.cjs
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

function normalizeMetaName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueMetaAdsCampaigns(ads) {
  const map = new Map()
  for (const a of ads || []) {
    const id = String(a.campaignId || a.campaign_id || "").trim()
    const name = String(a.campaignName || a.campaign_name || "").trim()
    const key = id || name
    if (!key) continue
    if (!map.has(key)) map.set(key, name || id)
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(" ").filter((t) => t.length >= 2))
  const tb = new Set(b.split(" ").filter((t) => t.length >= 2))
  if (!ta.size || !tb.size) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit += 1
  return hit / Math.max(ta.size, tb.size)
}

function suggest(campaigns, ads) {
  const metaList = uniqueMetaAdsCampaigns(ads)
  const used = new Set()
  const out = []
  for (const c of campaigns) {
    if (String(c.meta_campaign_id || "").trim() || String(c.meta_campaign_name || "").trim()) continue
    const topic = normalizeMetaName(c.topic || "")
    if (!topic) continue
    let best = null
    for (const m of metaList) {
      const key = m.id || m.name
      if (used.has(key)) continue
      const name = normalizeMetaName(m.name || m.id)
      if (!name) continue
      let score = 0
      if (name === topic) score = 1
      else if (name.includes(topic) || topic.includes(name)) score = 0.85
      else score = tokenOverlap(topic, name)
      if (score < 0.45) continue
      if (!best || score > best.score) {
        best = {
          campaignId: c.id,
          topic: c.topic,
          metaCampaignId: m.id || "",
          metaCampaignName: m.name || m.id,
          score,
        }
      }
    }
    if (best) {
      used.add(best.metaCampaignId || best.metaCampaignName)
      out.push(best)
    }
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

async function sb(pathQs, init) {
  const res = await fetch(`${url}/rest/v1/${pathQs}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`)
  return json
}

;(async () => {
  const conns = await sb(
    "marketing_meta_connections?select=id,page_name,last_synced_at,last_sync_json&order=updated_at.desc&limit=1"
  )
  const conn = Array.isArray(conns) ? conns[0] : null
  const ads = Array.isArray(conn?.last_sync_json?.ads) ? conn.last_sync_json.ads : []
  const campaigns = await sb(
    "marketing_campaigns?status=eq.ongoing&select=id,topic,meta_campaign_id,meta_campaign_name&order=id.desc&limit=200"
  )
  const suggestions = suggest(Array.isArray(campaigns) ? campaigns : [], ads)
  const applied = []
  for (const s of suggestions) {
    await sb(`marketing_campaigns?id=eq.${s.campaignId}`, {
      method: "PATCH",
      body: JSON.stringify({
        meta_campaign_id: s.metaCampaignId,
        meta_campaign_name: s.metaCampaignName,
        updated_at: new Date().toISOString(),
      }),
    })
    applied.push(s)
  }
  console.log(
    JSON.stringify(
      {
        page: conn?.page_name || null,
        lastSyncedAt: conn?.last_synced_at || null,
        ads: ads.length,
        metaCampaigns: uniqueMetaAdsCampaigns(ads).length,
        suggestions: suggestions.length,
        applied: applied.map((a) => ({
          id: a.campaignId,
          topic: a.topic,
          meta: a.metaCampaignName,
          score: a.score,
        })),
      },
      null,
      2
    )
  )
})().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
