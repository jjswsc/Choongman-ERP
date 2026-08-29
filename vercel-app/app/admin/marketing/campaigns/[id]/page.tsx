"use client"

import { useParams } from "next/navigation"
import { MarketingCampaignWorkspace } from "@/components/marketing/marketing-campaign-workspace"

export default function MarketingCampaignWorkspacePage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(String(params?.id || "")).trim()
  if (!id) return null
  return <MarketingCampaignWorkspace campaignId={id} />
}
