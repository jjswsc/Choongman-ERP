"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import {
  getAdminHelpAudienceFromRole,
  getEmbeddedForHref,
  getHelpItemByHref,
  hrefToHelpSummaryKey,
  matchErpNavHrefForHelp,
} from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"

type ErpInlinePageHelpProps = { className?: string }

/**
 * 페이지 본문에 넣는 짧은 도움말.
 * i18n `helpSum_*`·본/가맹 분기는 상단 도움말 시트와 동일.
 * 입고/급여 등 `embedded` 경로는 중복을 피해 렌더하지 않는다(전용 가이드·시트 사용).
 */
export function ErpInlinePageHelp({ className }: ErpInlinePageHelpProps) {
  const pathname = usePathname() || "/admin"
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const audience = getAdminHelpAudienceFromRole(auth?.role)
  const audLabel = audience === "office" ? t("adminHelpAudienceLabel_office") : t("adminHelpAudienceLabel_franchise")

  const matchedHref = React.useMemo(() => matchErpNavHrefForHelp(pathname), [pathname])
  const helpItem = matchedHref ? getHelpItemByHref(matchedHref) : undefined
  const summaryKey = matchedHref ? hrefToHelpSummaryKey(matchedHref) : null
  const embedded = matchedHref ? getEmbeddedForHref(matchedHref) : undefined

  if (embedded) return null

  if (!matchedHref || !helpItem || !summaryKey) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("adminHelpNoSummary")}</p>
  }

  const title = t(helpItem.titleKey)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Badge variant="secondary" className="text-[10px] font-normal">
          {audLabel}
        </Badge>
      </div>
      <HelpSumHowBlocks helpSumKey={summaryKey} />
    </div>
  )
}
