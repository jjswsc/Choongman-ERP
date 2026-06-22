"use client"

import * as React from "react"
import { ChevronRight, Star } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import { MP_CARD_TEXT_MUTED, MP_CARD_TEXT_PRIMARY, MP_CARD_TEXT_SECONDARY, MP_CARD_TEXT_SUBTLE, MP_MAX_WIDTH } from "@/lib/member-portal-design"
import { tierVisual } from "@/components/member-portal/portal-ui"
import { MemberPortalTierGem } from "@/components/member-portal/member-portal-tier-gem"
import { normalizeMemberTierCode, type MemberTierPublic } from "@/lib/member-tier-public"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

type Props = {
  tiers: MemberTierPublic[]
  currentTierCode?: string
  pointRetentionYears?: number
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
      className={`px-4 py-3 ${isCurrent ? `ring-1 ${visual.border} ${visual.glow}` : ""}`}
    >
      <div className="flex items-start gap-3">
        <MemberPortalTierGem tier={visual} label={tier.name} size="sm" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{tier.name}</p>
            {isCurrent ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                {t("tierCurrentBadge")}
              </span>
            ) : null}
          </div>
          <p className={`mt-1 text-xs ${MP_CARD_TEXT_SECONDARY}`}>{tier.pointRangeLabel}</p>
          <p className={`mt-0.5 text-xs ${MP_CARD_TEXT_MUTED}`}>{tier.spendLabel}</p>
          {tier.benefits ? (
            <p className={`mt-2 whitespace-pre-line text-xs leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{tier.benefits}</p>
          ) : null}
          <p className={`mt-2 text-[11px] ${MP_CARD_TEXT_SUBTLE}`}>
            {earnRateLabel}: {(tier.pointRate * 100).toFixed(1)}%
          </p>
          {tier.discountRate > 0 ? (
            <p className={`mt-0.5 text-[11px] ${MP_CARD_TEXT_SUBTLE}`}>
              {t("tierDiscountRate")}: {(tier.discountRate * 100).toFixed(1)}%
            </p>
          ) : null}
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

export function MemberPortalTierGuide({ tiers, currentTierCode, pointRetentionYears = 2 }: Props) {
  const { t } = useMemberPortalLang()
  const yearsText = String(pointRetentionYears)

  if (tiers.length === 0) return null

  return (
    <div className="space-y-3">
      <GlassCard soft className={`px-4 py-3 ${MP_CARD_TEXT_SECONDARY}`}>
        <p className={`text-xs font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("tierPointExpiryPolicyTitle")}</p>
        <p className={`mt-1.5 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>
          {t("tierPointExpiryPolicyDesc", { years: yearsText })}
        </p>
      </GlassCard>
      <div>
        <h3 className={`text-sm font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("tierGuideTitle")}</h3>
        <p className={`mt-1 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>{t("tierGuideDesc")}</p>
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
      className={`px-4 py-3 ${isCurrent ? `ring-1 ${visual.border} ${visual.glow}` : ""}`}
    >
      <div className="flex items-start gap-3">
        <MemberPortalTierGem tier={visual} label={tier.name} size="sm" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{tier.name}</p>
            {isCurrent ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                {t("tierCurrentBadge")}
              </span>
            ) : null}
          </div>
          {tier.benefits ? (
            <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{tier.benefits}</p>
          ) : (
            <p className={`mt-2 text-xs ${MP_CARD_TEXT_SUBTLE}`}>{benefitsEmptyLabel}</p>
          )}
          <p className={`mt-2 text-[11px] ${MP_CARD_TEXT_SUBTLE}`}>
            {earnRateLabel}: {(tier.pointRate * 100).toFixed(1)}%
          </p>
          {tier.discountRate > 0 ? (
            <p className={`mt-0.5 text-[11px] ${MP_CARD_TEXT_SUBTLE}`}>
              {t("tierDiscountRate")}: {(tier.discountRate * 100).toFixed(1)}%
            </p>
          ) : null}
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

export function MemberPortalTierBenefits({ tiers, currentTierCode, pointRetentionYears = 2 }: Props) {
  const { t } = useMemberPortalLang()
  const yearsText = String(pointRetentionYears)

  if (tiers.length === 0) return null

  return (
    <div className="space-y-3">
      <GlassCard soft className={`px-4 py-3 ${MP_CARD_TEXT_SECONDARY}`}>
        <p className={`text-xs font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("tierPointExpiryPolicyTitle")}</p>
        <p className={`mt-1.5 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>
          {t("tierPointExpiryPolicyDesc", { years: yearsText })}
        </p>
      </GlassCard>
      <div>
        <h3 className={`text-sm font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("tierBenefitsTitle")}</h3>
        <p className={`mt-1 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>{t("tierBenefitsDesc")}</p>
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
      <GlassCard soft className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-stone-50 active:scale-[0.99]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/40 bg-amber-50">
          <Star className="h-5 w-5 text-amber-600" fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{title}</p>
          {description ? <p className={`mt-0.5 line-clamp-2 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>{description}</p> : null}
        </div>
        <ChevronRight className={`h-5 w-5 shrink-0 ${MP_CARD_TEXT_SUBTLE}`} aria-hidden />
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

const TierSelectorRow = React.memo(function TierSelectorRow({
  tiers,
  activeTierCode,
  onSelect,
}: {
  tiers: MemberTierPublic[]
  activeTierCode: string
  onSelect: (code: string) => void
}) {
  if (tiers.length <= 1) return null

  return (
    <div
      className="mb-4 grid gap-2 rounded-3xl bg-white/5 p-2 ring-1 ring-white/10"
      style={{ gridTemplateColumns: `repeat(${Math.min(tiers.length, 5)}, minmax(0, 1fr))` }}
    >
      {tiers.map((tier) => {
        const isActive = normalizeMemberTierCode(tier.code) === normalizeMemberTierCode(activeTierCode)
        const visual = tierVisual(tier.code)
        return (
          <button
            key={tier.code}
            type="button"
            onClick={() => onSelect(tier.code)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 transition ${
              isActive ? "bg-white/12 ring-1 ring-amber-400/50" : "hover:bg-white/6"
            }`}
          >
            <MemberPortalTierGem tier={visual} label={tier.name} size="sm" showLabel={false} />
            <span
              className={`max-w-full truncate px-1 text-[9px] font-bold uppercase tracking-wide ${
                isActive ? "text-white" : "text-white/45"
              }`}
            >
              {tier.name}
            </span>
          </button>
        )
      })}
    </div>
  )
})

export function MemberPortalTierBenefitsSheet({
  open,
  tiers,
  currentTierCode,
  pointRetentionYears = 2,
  closeLabel,
  onClose,
}: Props & {
  open: boolean
  closeLabel: string
  onClose: () => void
}) {
  const { t } = useMemberPortalLang()
  const yearsText = String(pointRetentionYears)
  const [selectedTierCode, setSelectedTierCode] = React.useState(currentTierCode || "BRONZE")

  React.useEffect(() => {
    if (open) setSelectedTierCode(currentTierCode || "BRONZE")
  }, [open, currentTierCode])

  if (!open || tiers.length === 0) return null

  const selectedTier =
    tiers.find((tier) => normalizeMemberTierCode(tier.code) === normalizeMemberTierCode(selectedTierCode)) ||
    tiers[0]

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
        <p className="mt-2 text-xs leading-relaxed text-white/45">
          {t("tierPointExpiryPolicyDesc", { years: yearsText })}
        </p>
        <div className="mt-4">
          <TierSelectorRow
            tiers={tiers}
            activeTierCode={selectedTierCode}
            onSelect={setSelectedTierCode}
          />
          {selectedTier ? (
            <TierBenefitCard
              tier={selectedTier}
              isCurrent={normalizeMemberTierCode(selectedTier.code) === normalizeMemberTierCode(currentTierCode || "BRONZE")}
              earnRateLabel={t("tierEarnRate")}
              benefitsEmptyLabel={t("tierBenefitsEmpty")}
            />
          ) : null}
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
  const [pointRetentionYears, setPointRetentionYears] = React.useState(2)
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
        const data = (await res.json()) as {
          success?: boolean
          tiers?: MemberTierPublic[]
          pointRetentionYears?: number
        }
        if (!cancelled) {
          startTransition(() => {
            setTiers(data.success ? data.tiers || [] : [])
            if (typeof data.pointRetentionYears === "number" && data.pointRetentionYears > 0) {
              setPointRetentionYears(data.pointRetentionYears)
            }
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

  return { tiers, pointRetentionYears, loading }
}
