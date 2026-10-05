import "server-only"

import {
  appendSaasTenantFilter,
  stampSaasTenantId,
  type SaasTenantScope,
} from "@/lib/saas-tenant-scope"
import {
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"
import { suggestMetaCampaignMappings } from "@/lib/marketing-meta-auto-map"
import { filterAdsForCampaign } from "@/lib/marketing-meta-match"
import { loadMetaConnectionRow, syncMetaConnection } from "@/lib/meta-connection-server"
import { syncTikTokConnection, loadTikTokConnectionRow } from "@/lib/tiktok-connection-server"
import { getAllManagers, sendNoticeToRecipients, type NoticeRecipient } from "@/lib/send-notice-util"
import { isOfficeRole, isAccountingRole } from "@/lib/permissions"
import { supabaseSelect } from "@/lib/supabase-server"
import type { MetaAdInsightRow } from "@/lib/meta-graph"
import { bangkokTodayYmd } from "@/lib/bangkok-date"

export async function getMarketingOfficeRecipients(): Promise<NoticeRecipient[]> {
  const rows = (await supabaseSelect("employees", {
    select: "store,name,role",
    limit: 5000,
  })) as { store?: string; name?: string; role?: string }[] | null
  const fromRoles = (rows || [])
    .filter((r) => isOfficeRole(String(r.role || "")) || isAccountingRole(String(r.role || "")))
    .map((r) => ({ store: String(r.store || "").trim(), name: String(r.name || "").trim() }))
    .filter((r) => r.store && r.name)
  if (fromRoles.length) return fromRoles
  return getAllManagers()
}

type CampaignRow = {
  id: number
  topic?: string
  status?: string
  budget_total?: number | string | null
  meta_campaign_id?: string | null
  meta_campaign_name?: string | null
  start_date?: string | null
  end_date?: string | null
}

export async function loadOngoingCampaigns(tenantScope: SaasTenantScope): Promise<CampaignRow[]> {
  const filter = appendSaasTenantFilter("status=eq.ongoing", tenantScope, "marketing_campaigns")
  const rows = (await supabaseSelectFilter("marketing_campaigns", filter, {
    select: "id,topic,status,budget_total,meta_campaign_id,meta_campaign_name,start_date,end_date",
    order: "id.desc",
    limit: 200,
  })) as CampaignRow[] | null
  return rows || []
}

export async function applyMetaAutoMap(
  tenantScope: SaasTenantScope,
  opts?: { syncFirst?: boolean; dryRun?: boolean }
): Promise<{
  synced: boolean
  suggestions: ReturnType<typeof suggestMetaCampaignMappings>
  applied: number
  diagnostics: string[]
}> {
  const diagnostics: string[] = []
  let ads: MetaAdInsightRow[] = []
  let synced = false

  if (opts?.syncFirst !== false) {
    try {
      const payload = await syncMetaConnection(tenantScope)
      ads = payload.ads || []
      synced = true
      if (payload.diagnostics?.length) diagnostics.push(...payload.diagnostics)
    } catch (e) {
      diagnostics.push(`sync:${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!ads.length) {
    const row = await loadMetaConnectionRow(tenantScope)
    const last = (row?.last_sync_json || {}) as { ads?: MetaAdInsightRow[] }
    ads = Array.isArray(last.ads) ? last.ads : []
    if (!ads.length) diagnostics.push("no_ads_insights")
  }

  const campaigns = await loadOngoingCampaigns(tenantScope)
  const suggestions = suggestMetaCampaignMappings({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      topic: String(c.topic || ""),
      status: c.status,
      metaCampaignId: c.meta_campaign_id || undefined,
      metaCampaignName: c.meta_campaign_name || undefined,
    })),
    ads,
    onlyUnmapped: true,
  })
  let applied = 0
  if (!opts?.dryRun) {
    for (const s of suggestions) {
      const patch = stampSaasTenantId(
        {
          meta_campaign_id: s.metaCampaignId,
          meta_campaign_name: s.metaCampaignName,
          updated_at: new Date().toISOString(),
        },
        tenantScope,
        "marketing_campaigns"
      )
      await supabaseUpdateByFilter("marketing_campaigns", `id=eq.${s.campaignId}`, patch)
      applied += 1
    }
  }
  return { synced, suggestions, applied, diagnostics }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

export async function runMarketingAdsWeeklySync(tenantScope: SaasTenantScope): Promise<{
  meta: { ok: boolean; spend: number; ads: number; message?: string }
  tiktok: { ok: boolean; spend: number; ads: number; message?: string }
  autoMap: { applied: number; suggestions: number }
  budgetAlerts: { campaignId: number; topic: string; budget: number; spend: number; ratio: number }[]
  noticeSent: boolean
}> {
  const today = bangkokTodayYmd()
  let metaSpend = 0
  let metaAds = 0
  let metaOk = false
  let metaMsg = ""
  let ads: MetaAdInsightRow[] = []

  try {
    const payload = await syncMetaConnection(tenantScope)
    metaOk = true
    ads = payload.ads || []
    metaAds = ads.length
    metaSpend = Number(payload.adsTotals?.spend || 0)
  } catch (e) {
    metaMsg = e instanceof Error ? e.message : String(e)
  }

  let ttSpend = 0
  let ttAds = 0
  let ttOk = false
  let ttMsg = ""
  try {
    const row = await loadTikTokConnectionRow(tenantScope)
    if (row || process.env.TIKTOK_ACCESS_TOKEN) {
      const payload = await syncTikTokConnection(tenantScope)
      ttOk = true
      ttAds = payload.ads?.length || 0
      ttSpend = Number(payload.adsTotals?.spend || 0)
    } else {
      ttMsg = "not_connected"
    }
  } catch (e) {
    ttMsg = e instanceof Error ? e.message : String(e)
  }

  const autoMap = await applyMetaAutoMap(tenantScope, { syncFirst: false, dryRun: false })
  if (!ads.length) {
    const row = await loadMetaConnectionRow(tenantScope)
    const last = (row?.last_sync_json || {}) as { ads?: MetaAdInsightRow[] }
    ads = Array.isArray(last.ads) ? last.ads : []
  }

  const campaigns = await loadOngoingCampaigns(tenantScope)
  const budgetAlerts: {
    campaignId: number
    topic: string
    budget: number
    spend: number
    ratio: number
  }[] = []

  const inflRows = ((await supabaseSelectFilter(
    "marketing_influencers",
    appendSaasTenantFilter("id=gt.0", tenantScope, "marketing_influencers"),
    { select: "campaign_id,budget,actual_cost", limit: 8000 }
  )) as { campaign_id?: number; budget?: number; actual_cost?: number }[] | null) || []

  const inflByCampaign = new Map<number, number>()
  for (const row of inflRows) {
    const cid = Number(row.campaign_id)
    if (!Number.isFinite(cid) || cid <= 0) continue
    const cost = num(row.actual_cost) > 0 ? num(row.actual_cost) : num(row.budget)
    inflByCampaign.set(cid, (inflByCampaign.get(cid) || 0) + cost)
  }

  const erpAdsRows = ((await supabaseSelectFilter(
    "marketing_ads",
    appendSaasTenantFilter("id=gt.0", tenantScope, "marketing_ads"),
    { select: "campaign_id,actual_spent", limit: 8000 }
  )) as { campaign_id?: number; actual_spent?: number }[] | null) || []
  const erpAdsByCampaign = new Map<number, number>()
  for (const row of erpAdsRows) {
    const cid = Number(row.campaign_id)
    if (!Number.isFinite(cid) || cid <= 0) continue
    erpAdsByCampaign.set(cid, (erpAdsByCampaign.get(cid) || 0) + num(row.actual_spent))
  }

  for (const c of campaigns) {
    const budget = num(c.budget_total)
    if (budget <= 0) continue
    const metaSpend = filterAdsForCampaign(ads, {
      metaCampaignId: c.meta_campaign_id || undefined,
      metaCampaignName: c.meta_campaign_name || undefined,
      topic: String(c.topic || ""),
    }).reduce((s, a) => s + num(a.spend), 0)
    const spend =
      metaSpend + (erpAdsByCampaign.get(c.id) || 0) + (inflByCampaign.get(c.id) || 0)
    if (spend <= 0) continue
    const ratio = spend / budget
    if (ratio >= 0.8) {
      budgetAlerts.push({
        campaignId: c.id,
        topic: String(c.topic || c.id),
        budget,
        spend,
        ratio,
      })
    }
  }

  const lines = [
    `[Marketing ads sync] ${today} (Bangkok)`,
    `Meta: ${metaOk ? `OK · spend ${metaSpend.toFixed(0)} · ads ${metaAds}` : `skip/fail (${metaMsg || "-"})`}`,
    `TikTok: ${ttOk ? `OK · spend ${ttSpend.toFixed(0)} · ads ${ttAds}` : `skip (${ttMsg || "-"})`}`,
    `Auto-map applied: ${autoMap.applied}`,
  ]
  if (budgetAlerts.length) {
    lines.push("Budget alerts (≥80%):")
    for (const a of budgetAlerts.slice(0, 8)) {
      lines.push(
        `- #${a.campaignId} ${a.topic}: ${Math.round(a.ratio * 100)}% (${a.spend.toFixed(0)} / ${a.budget.toFixed(0)})`
      )
    }
  }

  let noticeSent = false
  try {
    const recipients = await getMarketingOfficeRecipients()
    if (recipients.length) {
      await sendNoticeToRecipients({
        title: `마케팅 광고 주간 동기화 ${today}`,
        content: lines.join("\n"),
        recipients,
        sender: "마케팅 시스템",
        pushGate: "notice",
      })
      noticeSent = true
    }
  } catch (e) {
    console.error("marketing weekly notice:", e)
  }

  return {
    meta: { ok: metaOk, spend: metaSpend, ads: metaAds, message: metaMsg || undefined },
    tiktok: { ok: ttOk, spend: ttSpend, ads: ttAds, message: ttMsg || undefined },
    autoMap: { applied: autoMap.applied, suggestions: autoMap.suggestions.length },
    budgetAlerts,
    noticeSent,
  }
}
