"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import { tierVisual } from "@/components/member-portal/portal-ui"
import { normalizeMemberTierCode, type MemberTierPublic } from "@/lib/member-tier-public"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

type Props = {
  tiers: MemberTierPublic[]
  currentTierCode?: string
}

export function MemberPortalTierGuide({ tiers, currentTierCode }: Props) {
  const { t } = useMemberPortalLang()
  const activeCode = normalizeMemberTierCode(currentTierCode || "BRONZE")

  if (tiers.length === 0) return null

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("tierGuideTitle")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{t("tierGuideDesc")}</p>
      </div>
      <div className="space-y-2">
        {tiers.map((tier) => {
          const isCurrent = normalizeMemberTierCode(tier.code) === activeCode
          const visual = tierVisual(tier.code)
          return (
            <GlassCard
              key={tier.code}
              soft
              className={`px-4 py-3 ${isCurrent ? `ring-1 ring-amber-300/40 ${visual.glow}` : ""}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-black/25 ${visual.chip}`}
                >
                  <Star className={`h-4 w-4 ${visual.accent}`} fill="currentColor" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{tier.name}</p>
                    {isCurrent ? (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-100">
                        {t("tierCurrentBadge")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-white/70">{tier.pointRangeLabel}</p>
                  <p className="mt-0.5 text-xs text-white/45">{tier.spendLabel}</p>
                  {tier.benefits ? (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-white/65">{tier.benefits}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-white/40">
                    {t("tierEarnRate")}: {(tier.pointRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </GlassCard>
          )
        })}
      </div>
    </div>
  )
}

export function useMemberPortalTiers() {
  const { lang } = useMemberPortalLang()
  const [tiers, setTiers] = React.useState<MemberTierPublic[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/member-portal/tiers?lang=${encodeURIComponent(lang)}`, {
          cache: "no-store",
          credentials: "same-origin",
        })
        const data = (await res.json()) as { success?: boolean; tiers?: MemberTierPublic[] }
        if (!cancelled) setTiers(data.success ? data.tiers || [] : [])
      } catch {
        if (!cancelled) setTiers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lang])

  return { tiers, loading }
}
