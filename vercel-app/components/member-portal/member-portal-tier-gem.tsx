"use client"

import type { TierVisual } from "@/lib/member-portal-tier-visual"
import { cn } from "@/lib/utils"
import { TierFacetedGemIcon } from "@/components/member-portal/member-portal-tier-gem-icon"

type MemberPortalTierGemProps = {
  tier: TierVisual
  label: string
  size?: "sm" | "md" | "lg"
  className?: string
  showLabel?: boolean
}

const SIZE = {
  sm: { px: 36, label: "text-[8px] mt-1" },
  md: { px: 48, label: "text-[9px] mt-1.5" },
  lg: { px: 56, label: "text-[10px] mt-2" },
} as const

export function MemberPortalTierGem({
  tier,
  label,
  size = "md",
  className,
  showLabel = true,
}: MemberPortalTierGemProps) {
  const s = SIZE[size]

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <TierFacetedGemIcon family={tier.family} size={s.px} />
      {showLabel ? (
        <span
          className={cn(
            "max-w-[5.5rem] truncate text-center font-bold uppercase tracking-[0.14em]",
            s.label,
            tier.accent
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}
