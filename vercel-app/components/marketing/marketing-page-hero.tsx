"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type MarketingPageHeroProps = {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  /** 제목 옆 배지 (캘린더의「방콕 기준」, 광고 ROAS 배지 등) */
  badge?: React.ReactNode
  /** 우측 액션 (버튼 등) */
  actions?: React.ReactNode
  /** 설명 아래 추가 블록 (프로모션 선택 캠페인 표시 등) */
  footer?: React.ReactNode
  className?: string
  /** 캘린더 패널 등 중첩 시 h2 */
  headingLevel?: "h1" | "h2"
}

/**
 * 통합 마케팅 캘린더 상단과 동일한 헤더 스타일
 * (gradient 카드 · 아이콘 11 · violet blur)
 */
export function MarketingPageHero({
  icon: Icon,
  title,
  description,
  badge,
  actions,
  footer,
  className,
  headingLevel = "h1",
}: MarketingPageHeroProps) {
  const titleClass = "text-lg font-bold tracking-tight sm:text-xl"
  const titleEl =
    headingLevel === "h2" ? <h2 className={titleClass}>{title}</h2> : <h1 className={titleClass}>{title}</h1>

  return (
    <div
      className={cn(
        "relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-violet-500/5 p-5 shadow-sm sm:p-6",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 shadow-inner">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {titleEl}
              {badge}
            </div>
            {description != null && (
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
            {footer != null && <div className="mt-2">{footer}</div>}
          </div>
        </div>
        {actions != null && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}
