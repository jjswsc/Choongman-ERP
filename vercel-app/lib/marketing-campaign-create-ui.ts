/** 캠페인 목록에서 생성 폼·「새 캠페인」버튼을 보일지. 나중에 true로 되돌리면 됨. */
export const MARKETING_CAMPAIGN_CREATE_UI = false

export const MARKETING_CAMPAIGN_WORKSPACE_TABS = [
  "overview",
  "promos",
  "collab",
  "tasks",
  "results",
] as const

export type MarketingCampaignWorkspaceTab = (typeof MARKETING_CAMPAIGN_WORKSPACE_TABS)[number]

const LEGACY_TAB_MAP: Record<string, MarketingCampaignWorkspaceTab> = {
  materials: "tasks",
  influencers: "tasks",
  results: "results",
  form: "overview",
}

export function parseMarketingCampaignWorkspaceTab(raw: string | null | undefined): MarketingCampaignWorkspaceTab {
  const s = String(raw || "").trim()
  if ((MARKETING_CAMPAIGN_WORKSPACE_TABS as readonly string[]).includes(s)) {
    return s as MarketingCampaignWorkspaceTab
  }
  return LEGACY_TAB_MAP[s] || "overview"
}

export function marketingCampaignWorkspaceHref(
  id: string,
  tab?: string | null
): string {
  const cid = String(id || "").trim()
  if (!cid) return "/admin/marketing/campaigns"
  const mapped = parseMarketingCampaignWorkspaceTab(tab)
  const q = mapped === "overview" ? "" : `?tab=${encodeURIComponent(mapped)}`
  return `/admin/marketing/campaigns/${encodeURIComponent(cid)}${q}`
}
