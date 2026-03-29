"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { MarketingIntegratedCalendarPanel } from "@/components/marketing/marketing-integrated-calendar-panel"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"

export default function MarketingCalendarPage() {
  const searchParams = useSearchParams()
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""

  return (
    <MarketingPageShell>
      <MarketingIntegratedCalendarPanel
        campaignIdFromQuery={campaignIdFromQuery}
        hideHeroDescription
      />
    </MarketingPageShell>
  )
}
