"use client"

import * as React from "react"
import { ChevronRight, Star } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import { MP_MAX_WIDTH } from "@/lib/member-portal-design"
import { tierVisual } from "@/components/member-portal/portal-ui"
import { normalizeMemberTierCode, type MemberTierPublic } from "@/lib/member-tier-public"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

type Props = {
  tiers: MemberTierPublic[]
  currentTierCode?: string
}

const TierGuideCard = React.memo(function TierGuideCard({
  tier,
  isCurrent,
  earnRateLabel,
}: {
  tier: MemberTierPublic
  isCurrent: boolean
  earnRateLabel: string
}) {
  const { t } = useMemberPortalLang()
  const visual = tierVisual(tier.code)
  return (
    <GlassCard
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
            {earnRateLabel}: {(tier.pointRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>
    </GlassCard>
  )
})

const TierGuideList = React.memo(function TierGuideList({ tiers, currentTierCode }: Props) {
  const { t } = useMemberPortalLang()
  const activeCode = normalizeMemberTierCode(currentTierCode || "BRONZE")
  const earnRateLabel = t("tierEarnRate")

  return (
    <div className="space-y-2">
      {tiers.map((tier) => (
        <TierGuideCard
          key={tier.code}
          tier={tier}
          isCurrent={normalizeMemberTierCode(tier.code) === activeCode}
          earnRateLabel={earnRateLabel}
        />
      ))}
    </div>
  )
})

export function MemberPortalTierGuide({ tiers, currentTierCode }: Props) {
  const { t } = useMemberPortalLang()

  if (tiers.length === 0) return null

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("tierGuideTitle")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{t("tierGuideDesc")}</p>
      </div>
      <TierGuideList tiers={tiers} currentTierCode={currentTierCode} />
    </div>
  )
}

const TierBenefitCard = React.memo(function TierBenefitCard({
  tier,
  isCurrent,
  earnRateLabel,
  benefitsEmptyLabel,
}: {
  tier: MemberTierPublic
  isCurrent: boolean
  earnRateLabel: string
  benefitsEmptyLabel: string
}) {
  const { t } = useMemberPortalLang()
  const visual = tierVisual(tier.code)
  return (
    <GlassCard
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
          {tier.benefits ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">{tier.benefits}</p>
          ) : (
            <p className="mt-2 text-xs text-white/40">{benefitsEmptyLabel}</p>
          )}
          <p className="mt-2 text-[11px] text-white/40">
            {earnRateLabel}: {(tier.pointRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>
    </GlassCard>
  )
})

const TierBenefitsList = React.memo(function TierBenefitsList({ tiers, currentTierCode }: Props) {
  const { t } = useMemberPortalLang()
  const activeCode = normalizeMemberTierCode(currentTierCode || "BRONZE")
  const earnRateLabel = t("tierEarnRate")
  const benefitsEmptyLabel = t("tierBenefitsEmpty")

  return (
    <div className="space-y-2">
      {tiers.map((tier) => (
        <TierBenefitCard
          key={tier.code}
          tier={tier}
          isCurrent={normalizeMemberTierCode(tier.code) === activeCode}
          earnRateLabel={earnRateLabel}
          benefitsEmptyLabel={benefitsEmptyLabel}
        />
      ))}
    </div>
  )
})

export function MemberPortalTierBenefits({ tiers, currentTierCode }: Props) {
  const { t } = useMemberPortalLang()

  if (tiers.length === 0) return null

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{t("tierBenefitsTitle")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{t("tierBenefitsDesc")}</p>
      </div>
      <TierBenefitsList tiers={tiers} currentTierCode={currentTierCode} />
    </div>
  )
}

export function MemberPortalTierEntryButton({
  title,
  description,
  onClick,
}: {
  title: string
  description?: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left">
      <GlassCard soft className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.06] active:scale-[0.99]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10">
          <Star className="h-5 w-5 text-amber-300" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white">{title}</p>
          {description ? <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/50">{description}</p> : null}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/35" aria-hidden />
      </GlassCard>
    </button>
  )
}

export function MemberPortalTierGuideSheet({
  open,
  tiers,
  currentTierCode,
  closeLabel,
  onClose,
}: Props & {
  open: boolean
  closeLabel: string
  onClose: () => void
}) {
  const { t } = useMemberPortalLang()

  if (!open || tiers.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-white/10 bg-[#121214] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-guide-sheet-title"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h3 id="tier-guide-sheet-title" className="text-lg font-semibold text-white">
          {t("tierGuideTitle")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{t("tierGuideDesc")}</p>
        <div className="mt-4">
          <TierGuideList tiers={tiers} currentTierCode={currentTierCode} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}

export function MemberPortalTierBenefitsSheet({
  open,
  tiers,
  currentTierCode,
  closeLabel,
  onClose,
}: Props & {
  open: boolean
  closeLabel: string
  onClose: () => void
}) {
  const { t } = useMemberPortalLang()

  if (!open || tiers.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-white/10 bg-[#121214] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-benefits-sheet-title"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h3 id="tier-benefits-sheet-title" className="text-lg font-semibold text-white">
          {t("tierBenefitsTitle")}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">{t("tierBenefitsDesc")}</p>
        <div className="mt-4">
          <TierBenefitsList tiers={tiers} currentTierCode={currentTierCode} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}

export function useMemberPortalTiers() {
  const { lang } = useMemberPortalLang()
  const [tiers, setTiers] = React.useState<MemberTierPublic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [, startTransition] = React.useTransition()

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
        if (!cancelled) {
          startTransition(() => {
            setTiers(data.success ? data.tiers || [] : [])
          })
        }
      } catch {
        if (!cancelled) {
          startTransition(() => {
            setTiers([])
          })
        }
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
