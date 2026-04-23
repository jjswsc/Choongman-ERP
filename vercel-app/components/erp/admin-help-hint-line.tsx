"use client"

import { Info } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** 화면 본문 상단에 붙이는 1줄: 도움말이 탭이 아닌 상단(책) 버튼·도움말 센터에 있음을 안내 */
export function AdminHelpHintLine({ className }: { className?: string }) {
  const t = useT(useLang().lang)
  return (
    <div
      className={cn(
        "mb-3 flex items-start gap-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
        className
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="leading-relaxed">{t("adminHelpDiscoverShort")}</p>
    </div>
  )
}
