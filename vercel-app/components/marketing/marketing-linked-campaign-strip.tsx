"use client"

import { LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

/** 광고 ROAS 등 — 등록 폼 상단의 연결 캠페인 요약 (컴팩트 높이) */
export function MarketingLinkedCampaignStrip(props: {
  label: string
  title: string
  className?: string
}) {
  const { label, title, className } = props
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2 rounded-lg border border-primary/35 bg-gradient-to-br from-primary/[0.12] via-primary/[0.06] to-transparent px-3 py-2 shadow-sm ring-1 ring-primary/10 sm:gap-2.5 sm:px-3.5",
        className
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/18 text-primary">
        <LayoutGrid className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-primary/90 sm:text-[10px]">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold leading-tight text-foreground">{title}</p>
      </div>
    </div>
  )
}
