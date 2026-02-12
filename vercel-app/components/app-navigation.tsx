"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Home,
  ClipboardList,
  Package,
  Users,
  Clock,
  MapPin,
  Settings,
} from "lucide-react"

const tabs = [
  { id: "home", labelKey: "tabHome" as const, icon: Home },
  { id: "orders", labelKey: "tabOrder" as const, icon: ClipboardList },
  { id: "usage", labelKey: "tabUsage" as const, icon: Package },
  { id: "hr", labelKey: "tabHr" as const, icon: Users },
  { id: "timesheet", labelKey: "tabTimesheet" as const, icon: Clock },
  { id: "visit", labelKey: "tabVisit" as const, icon: MapPin },
  { id: "admin", labelKey: "tabAdmin" as const, icon: Settings },
]

interface AppNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function AppNavigation({ activeTab, onTabChange }: AppNavigationProps) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <nav className="sticky top-[57px] z-40 border-b border-border/60 bg-card/90 backdrop-blur-md">
      <div className="flex overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 px-2 py-2.5 text-xs font-medium transition-colors",
                "min-w-[60px] whitespace-nowrap",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
              <span>{t(tab.labelKey)}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
