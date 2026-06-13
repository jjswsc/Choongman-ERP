"use client"

import { MarketingHomePanel } from "@/components/marketing/marketing-home-panel"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"

export default function MarketingPage() {
  return (
    <MarketingPageShell maxWidthClass="max-w-6xl" showSubnav={false}>
      <MarketingHomePanel />
    </MarketingPageShell>
  )
}
