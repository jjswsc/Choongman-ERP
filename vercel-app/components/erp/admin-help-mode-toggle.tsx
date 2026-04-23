"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { shouldShowAdminHelpModeToggle } from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"

export const ERP_HELP_PARAM = "erp_help"

type AdminHelpModeToggleProps = {
  className?: string
  /** 기본: 탭 행용 소형 */
  size?: "sm" | "xs"
}

/**
 * `?erp_help=1` 로 도움말 본문 전환. 일반 화면에서는「도움말」만,
 * 도움말 모드에서는「화면으로 돌아가기」만 표시(브라우저 뒤로가기와 무관하게 쿼리만 제거).
 */
export function AdminHelpModeToggle({ className, size = "sm" }: AdminHelpModeToggleProps) {
  const pathname = usePathname() || "/admin"
  const router = useRouter()
  const sp = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)

  const show = shouldShowAdminHelpModeToggle(pathname)
  const isHelp = sp.get(ERP_HELP_PARAM) === "1"

  const setMode = React.useCallback(
    (help: boolean) => {
      const p = new URLSearchParams(sp.toString())
      if (help) p.set(ERP_HELP_PARAM, "1")
      else p.delete(ERP_HELP_PARAM)
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [sp, router, pathname]
  )

  if (!show) return null

  const h = size === "xs" ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs"

  if (isHelp) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border-border/70 bg-background font-medium shadow-sm",
          h,
          className
        )}
        onClick={() => setMode(false)}
        aria-label={t("adminHelpBackToScreen")}
      >
        <ArrowLeft className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        <span className="max-w-[11rem] truncate sm:max-w-none">{t("adminHelpBackToScreen")}</span>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border-border/70 bg-background font-medium shadow-sm",
        h,
        className
      )}
      onClick={() => setMode(true)}
      aria-label={t("adminContentTabHelp")}
    >
      <BookOpen className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      <span>{t("adminContentTabHelp")}</span>
    </Button>
  )
}
