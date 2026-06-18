"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  MEMBER_PORTAL_TIER_GEM_COMPARE_FAMILIES,
  tierGemAssetUrl,
} from "@/lib/member-portal-tier-gem-assets"
import type { TierFamily } from "@/lib/member-portal-tier-visual"
import { TierFacetedGemIcon } from "@/components/member-portal/member-portal-tier-gem-icon"

const TIER_LABELS: Record<TierFamily, string> = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  platinum: "PLATINUM",
  diamond: "DIAMOND",
  vip: "VIP",
  default: "DEFAULT",
}

/** 관리자 비교 — 작은 pill 크기보다 크게 보여야 차이가 남 */
const COMPARE_GEM_SIZE = 96

function CompareCell({
  family,
  renderMode,
  variant,
  bgClass,
  caption,
}: {
  family: TierFamily
  renderMode: "svg" | "photo"
  variant?: "default" | "cardHero"
  bgClass: string
  caption: string
}) {
  const [photoState, setPhotoState] = React.useState<"loading" | "loaded" | "error" | null>(null)

  return (
    <div className={`flex flex-col items-center gap-2 rounded-lg p-4 ${bgClass}`}>
      <TierFacetedGemIcon
        family={family}
        size={COMPARE_GEM_SIZE}
        variant={variant}
        renderMode={renderMode}
        suppressPhotoFallback={renderMode === "photo"}
        onPhotoLoadState={renderMode === "photo" ? setPhotoState : undefined}
      />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{caption}</span>
      {renderMode === "photo" && photoState === "error" ? (
        <span className="text-[10px] font-medium text-rose-600">{tierGemAssetUrl(family)}</span>
      ) : null}
    </div>
  )
}

export function MemberPortalTierGemCompareAdminPanel() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        {t("mpAdmin_tierGemCompareDeployNote")}
      </p>
      <p className="text-sm text-muted-foreground">{t("mpAdmin_tierGemCompareDesc")}</p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-3 py-2 font-medium">{t("mpAdmin_tierGemCompareTier")}</th>
              <th className="px-3 py-2 font-medium">{t("mpAdmin_tierGemCompareSvg")}</th>
              <th className="px-3 py-2 font-medium">{t("mpAdmin_tierGemComparePhoto")}</th>
            </tr>
          </thead>
          <tbody>
            {MEMBER_PORTAL_TIER_GEM_COMPARE_FAMILIES.map((family) => (
              <tr key={family} className="border-b last:border-0">
                <td className="px-3 py-3 align-top font-medium uppercase">{TIER_LABELS[family]}</td>
                <td className="px-3 py-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <CompareCell
                      family={family}
                      renderMode="svg"
                      caption={`SVG · pill ${COMPARE_GEM_SIZE}px`}
                      bgClass="bg-[#fff0e5]"
                    />
                    <CompareCell
                      family={family}
                      renderMode="svg"
                      variant="cardHero"
                      caption={`SVG · card ${COMPARE_GEM_SIZE}px`}
                      bgClass="bg-gradient-to-br from-[#222] via-[#101010] to-[#262626]"
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <CompareCell
                      family={family}
                      renderMode="photo"
                      caption={`WebP · pill ${COMPARE_GEM_SIZE}px`}
                      bgClass="bg-[#fff0e5]"
                    />
                    <CompareCell
                      family={family}
                      renderMode="photo"
                      variant="cardHero"
                      caption={`WebP · card ${COMPARE_GEM_SIZE}px`}
                      bgClass="bg-gradient-to-br from-[#222] via-[#101010] to-[#262626]"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{t("mpAdmin_tierGemCompareSizeHint")}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/member-portal/tiers/diamond.webp" target="_blank" rel="noopener noreferrer">
            {t("mpAdmin_tierGemOpenAsset")}
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/m?gem=svg" target="_blank" rel="noopener noreferrer">
            {t("mpAdmin_tierGemPreviewSvg")}
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/m?gem=photo" target="_blank" rel="noopener noreferrer">
            {t("mpAdmin_tierGemPreviewPhoto")}
          </Link>
        </Button>
      </div>
    </div>
  )
}
