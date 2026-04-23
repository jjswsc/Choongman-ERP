"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { InboundGuideContent } from "@/components/inbound/inbound-guide"
import { PayrollHelpContent } from "@/components/admin/payroll-help-content"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { AdminHelpHandoverPanel } from "@/components/erp/admin-help-handover-panel"
import {
  getEmbeddedForHref,
  getAdminHelpAudienceFromRole,
  getHelpItemByHref,
  hrefToHelpSummaryKey,
  matchErpNavHrefForHelp,
} from "@/lib/admin-help-registry"

type ErpPageHelpButtonProps = {
  className?: string
  /** 기본 true — 라벨 + 책 아이콘을 `sm` 이상에서 보여 발견하기 쉽게 함 */
  showLabel?: boolean
}

/**
 * 현재 URL에 맞는 사이드바 항목 도움말 — 매칭되는 항목이 없으면 버튼을 렌더하지 않는다.
 */
export function ErpPageHelpButton({ className, showLabel = true }: ErpPageHelpButtonProps) {
  const pathname = usePathname() || "/admin"
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const audience = getAdminHelpAudienceFromRole(auth?.role)
  const audLabel = audience === "office" ? t("adminHelpAudienceLabel_office") : t("adminHelpAudienceLabel_franchise")

  const matchedHref = React.useMemo(() => matchErpNavHrefForHelp(pathname), [pathname])
  const helpItem = matchedHref ? getHelpItemByHref(matchedHref) : undefined
  const summaryKey = matchedHref ? hrefToHelpSummaryKey(matchedHref) : null
  const embedded = matchedHref ? getEmbeddedForHref(matchedHref) : undefined

  if (!matchedHref || !helpItem || !summaryKey) {
    return null
  }

  const title = t(helpItem.titleKey)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={showLabel ? "sm" : "icon"}
        className={cn(
          "shrink-0",
          showLabel && "h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
          className
        )}
        onClick={() => setOpen(true)}
        title={t("adminHelpThisPage")}
        aria-label={t("adminHelpThisPage")}
      >
        <BookOpen className="h-4 w-4 shrink-0" />
        {showLabel && (
          <span className="hidden sm:inline max-w-[5rem] truncate">{t("adminHelpHeaderThisScreen")}</span>
        )}
      </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col gap-0 p-0 sm:max-w-lg"
        showCloseButton
      >
        <SheetHeader className="shrink-0 space-y-1 border-b p-4 text-left pr-10">
          <div className="flex flex-wrap items-center gap-2 pr-2">
            <SheetTitle className="text-left">{title}</SheetTitle>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {audLabel}
            </Badge>
          </div>
          {embedded === "inbound" && (
            <SheetDescription className="text-left text-xs text-muted-foreground">
              {t("adminHelpFullGuideBelow")}
            </SheetDescription>
          )}
          {embedded === "payroll" && (
            <SheetDescription className="text-left text-xs text-muted-foreground">
              {t("adminHelpPayrollSheetHint")}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 flex flex-col">
          {embedded === "inbound" && (
            <ScrollArea className="h-[calc(100dvh-8rem)] pr-2">
              <div className="p-4 pt-0">
                <InboundGuideContent />
              </div>
            </ScrollArea>
          )}
          {embedded === "payroll" && (
            <ScrollArea className="h-[calc(100dvh-10rem)] pr-2">
              <div className="p-4 pt-0 space-y-4">
                <PayrollHelpContent className="border-0 shadow-none" />
                <p className="text-xs text-muted-foreground">
                  <Link
                    href="/admin/payroll?tab=help"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {t("adminHelpPayrollOpenTab")}
                  </Link>
                </p>
              </div>
            </ScrollArea>
          )}
          {!embedded && (
            <ScrollArea className="h-[calc(100dvh-8rem)] p-4 pt-3 pr-2">
              <div className="space-y-4 pb-6">
                <HelpSumHowBlocks helpSumKey={summaryKey} />
                <AdminHelpHandoverPanel helpHref={matchedHref} className="mt-0" />
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  )
}
