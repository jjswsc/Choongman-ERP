"use client"

import * as React from "react"
import { MarketingCampaignFinderPanel, type MarketingCampaignFinderPanelProps } from "@/components/marketing/marketing-campaign-finder-panel"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type MarketingHubCampaignContextStripProps = MarketingCampaignFinderPanelProps & {
  className?: string
  /** 선택 캠페인 요약(프로모션 세트 등) — 보조 텍스트 */
  summary?: React.ReactNode
  /** 라벨 오른쪽 (예: 캠페인 허브 링크) */
  aside?: React.ReactNode
}

/**
 * 마케팅 허브 하위 화면 공통 — 큰 페이지 히어로 대신 상단에만 두는 보조용 캠페인 찾기.
 */
export function MarketingHubCampaignContextStrip({
  className,
  summary,
  aside,
  ...panelProps
}: MarketingHubCampaignContextStripProps) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div
      className={cn(
        "mb-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-3 sm:px-5 sm:py-3.5",
        className
      )}
    >
      <MarketingCampaignFinderPanel
        toolbarLayout="compact"
        compactToolbarTitle={t("marketingCampaignFinderLabel")}
        compactToolbarEnd={aside != null ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : undefined}
        className="border-0 bg-transparent shadow-none rounded-none"
        {...panelProps}
      />
      {summary != null ? <div className="mt-2 border-t border-border/50 pt-2">{summary}</div> : null}
    </div>
  )
}
