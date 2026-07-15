"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { tierVisual } from "@/components/member-portal/portal-ui"
import { pickTierBenefits, type MemberPortalLang } from "@/lib/member-tier-public"
import { cn } from "@/lib/utils"

type Props = {
  tierCode: string
  tierName: string
  pointRate: number
  benefitsKo: string
  benefitsEn: string
  benefitsTh: string
  defaultLang?: MemberPortalLang
  previewTitle: string
  previewHint: string
  earnRateLabel: string
  emptyLabel: string
  langKoLabel: string
  langEnLabel: string
  langThLabel: string
}

export function MemberTierBenefitsPreview({
  tierCode,
  tierName,
  pointRate,
  benefitsKo,
  benefitsEn,
  benefitsTh,
  defaultLang = "ko",
  previewTitle,
  previewHint,
  earnRateLabel,
  emptyLabel,
  langKoLabel,
  langEnLabel,
  langThLabel,
}: Props) {
  const [previewLang, setPreviewLang] = React.useState<MemberPortalLang>(defaultLang)

  React.useEffect(() => {
    setPreviewLang(defaultLang)
  }, [defaultLang, tierCode])
  const visual = tierVisual(tierCode)
  const benefits = pickTierBenefits(
    { benefits_ko: benefitsKo, benefits_en: benefitsEn, benefits_th: benefitsTh },
    previewLang
  )

  const langOptions: Array<{ id: MemberPortalLang; label: string }> = [
    { id: "ko", label: langKoLabel },
    { id: "en", label: langEnLabel },
    { id: "th", label: langThLabel },
  ]

  return (
    <div className="rounded-xl border border-rose-200/60 bg-gradient-to-br from-rose-50/50 via-muted/20 to-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-rose-950">{previewTitle}</p>
          <p className="text-xs text-muted-foreground">{previewHint}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-rose-200/70 bg-white p-0.5 shadow-sm">
          {langOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreviewLang(opt.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                previewLang === opt.id
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-rose-50 hover:text-rose-900"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className={cn(
          "mx-auto max-w-sm overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-lg",
          visual.border,
          visual.gradient,
          visual.glow
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-black/25",
              visual.chip
            )}
          >
            <Star className={cn("h-4 w-4", visual.accent)} fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold", visual.titleClass)}>{tierName || tierCode}</p>
            {benefits ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/85">{benefits}</p>
            ) : (
              <p className="mt-2 text-xs text-white/45">{emptyLabel}</p>
            )}
            <p className="mt-2.5 inline-flex rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10">
              {earnRateLabel}: {(Math.max(0, Number(pointRate || 0)) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
