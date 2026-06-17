"use client"

import type { TierVisual } from "@/lib/member-portal-tier-visual"
import { cn } from "@/lib/utils"

type MemberPortalTierGemProps = {
  tier: TierVisual
  label: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const SIZE = {
  sm: { box: "h-9 w-9", gem: "h-6 w-6", shine: "h-3.5 w-3.5", label: "text-[8px] mt-1" },
  md: { box: "h-12 w-12", gem: "h-8 w-8", shine: "h-5 w-5", label: "text-[9px] mt-1.5" },
  lg: { box: "h-14 w-14", gem: "h-10 w-10", shine: "h-6 w-6", label: "text-[10px] mt-2" },
} as const

export function MemberPortalTierGem({ tier, label, size = "md", className }: MemberPortalTierGemProps) {
  const s = SIZE[size]

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className={cn("relative flex items-center justify-center", s.box)} aria-hidden>
        <div
          className={cn(
            "absolute rotate-45 rounded-md bg-gradient-to-br",
            s.gem,
            tier.gem,
            tier.gemGlow
          )}
        />
        <div
          className={cn(
            "absolute rotate-45 rounded-sm bg-gradient-to-br from-white/55 to-transparent",
            s.shine
          )}
        />
      </div>
      <span
        className={cn(
          "max-w-[5.5rem] truncate text-center font-bold uppercase tracking-[0.14em]",
          s.label,
          tier.accent
        )}
      >
        {label}
      </span>
    </div>
  )
}
