"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { tierVisual } from "@/components/member-portal/portal-ui"
import { pickTierBenefits, type MemberPortalLang } from "@/lib/member-tier-public"

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
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{previewTitle}</p>
          <p className="text-xs text-muted-foreground">{previewHint}</p>
        </div>
        <div className="flex gap-1 rounded-md border bg-background p-0.5">
          {langOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreviewLang(opt.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                previewLang === opt.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#121214] p-4 shadow-inner">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-black/25 ${visual.chip}`}
          >
            <Star className={`h-4 w-4 ${visual.accent}`} fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{tierName || tierCode}</p>
            {benefits ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">{benefits}</p>
            ) : (
              <p className="mt-2 text-xs text-white/40">{emptyLabel}</p>
            )}
            <p className="mt-2 text-[11px] text-white/40">
              {earnRateLabel}: {(Math.max(0, Number(pointRate || 0)) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
