"use client"

import { cn } from "@/lib/utils"
import { PenLine, Search, ClipboardList, ArrowUpFromLine } from "lucide-react"
import Link from "next/link"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export type ShipmentTabValue = "new" | "hist" | "order"

interface ShipmentHeaderProps {
  value?: ShipmentTabValue
  onValueChange?: (value: ShipmentTabValue) => void
  /** 본사 권한이 있으면 출고 입력 탭 표시 */
  showNewTab?: boolean
}

const TAB_CONFIG: { value: ShipmentTabValue; icon: typeof PenLine; labelKey: string; href?: string }[] = [
  { value: "new", icon: PenLine, labelKey: "outTabNew" },
  { value: "hist", icon: Search, labelKey: "outTabHist" },
  { value: "order", icon: ClipboardList, labelKey: "outTabOrderStatus", href: "/admin/orders" },
]

export function ShipmentHeader({ value = "hist", onValueChange, showNewTab = true }: ShipmentHeaderProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const tabs = TAB_CONFIG.filter((tab) => tab.value !== "new" || showNewTab)

  return (
    <div>
      {/* Page Title */}
      <div className="flex items-center gap-2 mb-4">
        <ArrowUpFromLine className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("adminOutbound")}</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border">
        {tabs.map((tab) => {
          const isActive = value === tab.value
          const content = (
            <>
              <tab.icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </>
          )
          const className = cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative",
            isActive
              ? "text-primary border-b-2 border-primary -mb-px"
              : "text-muted-foreground hover:text-foreground"
          )

          if (tab.href) {
            return (
              <Link key={tab.value} href={tab.href} className={className}>
                {content}
              </Link>
            )
          }

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onValueChange?.(tab.value)}
              className={className}
            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}
