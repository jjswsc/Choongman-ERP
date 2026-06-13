"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type MarketingStickyHubBarProps = {
  children: React.ReactNode
  className?: string
}

/** 탭·캠페인 찾기 등 허브 컨텍스트 — 스크롤 시 상단 고정 */
export function MarketingStickyHubBar({ children, className }: MarketingStickyHubBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 mb-4 space-y-0 border-b border-border/50 bg-background/95 px-4 pb-3 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className
      )}
    >
      {children}
    </div>
  )
}
