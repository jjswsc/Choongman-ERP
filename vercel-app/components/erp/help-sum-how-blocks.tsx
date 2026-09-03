"use client"

import { useAuth } from "@/lib/auth-context"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getAdminHelpAudienceFromRole,
  resolveHelpHow,
  resolveHelpLongHow,
  resolveHelpLongWhat,
  resolveHelpSummary,
} from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"

type HelpSumHowBlocksProps = {
  helpSumKey: string
  className?: string
  compact?: boolean
  /** `true`이면 `helpLongWhat_*` / `helpLongHow_*` 우선(없으면 짧은 helpSum/How) — 도움말 탭 본문용 */
  detail?: boolean
}

/** i18n `helpSum_*` + `helpHow_*` (또는 `detail` 시 `helpLongWhat_*` + `helpLongHow_*`) */
export function HelpSumHowBlocks({ helpSumKey, className, compact, detail }: HelpSumHowBlocksProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const brand = useAppBrandConfig()
  const audience = getAdminHelpAudienceFromRole(auth?.role, brand.key)
  const desc = detail
    ? resolveHelpLongWhat(t, helpSumKey, audience)
    : resolveHelpSummary(t, helpSumKey, audience)
  const how = detail
    ? resolveHelpLongHow(t, helpSumKey, audience)
    : resolveHelpHow(t, helpSumKey, audience)
  const descCls = compact ? "text-xs" : detail ? "text-sm sm:text-base" : "text-sm"
  const howCls = compact ? "text-xs" : detail ? "text-sm sm:text-base" : "text-sm"
  const labelCls = compact ? "text-[10px] uppercase tracking-wide" : "text-[11px] font-medium"

  return (
    <div className={cn("space-y-4", detail && "max-w-3xl", className)}>
      <div>
        <p className={cn("mb-1.5 text-foreground/80 font-medium", labelCls)}>{t("adminHelpBlockWhat")}</p>
        <p className={cn("text-muted-foreground whitespace-pre-line leading-relaxed", descCls)}>{desc}</p>
      </div>
      <div>
        <p className={cn("mb-1.5 text-foreground/80 font-medium", labelCls)}>{t("adminHelpBlockHow")}</p>
        <p className={cn("text-muted-foreground whitespace-pre-line leading-relaxed", howCls)}>{how}</p>
      </div>
    </div>
  )
}
