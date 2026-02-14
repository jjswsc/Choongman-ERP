"use client"

import { cn } from "@/lib/utils"
import { PenLine, Search, ArrowDownToLine } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export type InboundTabValue = "new" | "hist"

interface InboundHeaderProps {
  value?: InboundTabValue
  onValueChange?: (value: InboundTabValue) => void
  /** 본사 권한이 있으면 입고 입력 탭 표시 */
  showNewTab?: boolean
}

const TAB_CONFIG: { value: InboundTabValue; icon: typeof PenLine; labelKey: string }[] = [
  { value: "new", icon: PenLine, labelKey: "inTabNew" },
  { value: "hist", icon: Search, labelKey: "inTabHist" },
]

export function InboundHeader({ value = "hist", onValueChange, showNewTab = true }: InboundHeaderProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const tabs = TAB_CONFIG.filter((tab) => tab.value !== "new" || showNewTab)

  return (
    <div>
      {/* Page Title */}
      <div className="flex items-center gap-2 mb-4">
        <ArrowDownToLine className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("adminInbound")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        {tabs.map((tab) => {
          const isActive = value === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onValueChange?.(tab.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative",
                isActive
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
