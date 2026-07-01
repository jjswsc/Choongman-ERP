"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  Home,
  ClipboardList,
  Package,
  Users,
  Clock,
  MapPin,
  Banknote,
  Settings,
  Wrench,
} from "lucide-react"
import { isPhysicalStoreForRepair } from "@/lib/store-repair-visibility"
import { hasOfficeStaffScope } from "@/lib/permissions"

const tabs = [
  { id: "home", labelKey: "tabHome" as const, icon: Home },
  { id: "orders", labelKey: "tabOrder" as const, icon: ClipboardList },
  { id: "usage", labelKey: "tabUsage" as const, icon: Package },
  { id: "hr", labelKey: "tabHr" as const, icon: Users },
  { id: "timesheet", labelKey: "tabTimesheet" as const, icon: Clock },
  { id: "visit", labelKey: "tabVisit" as const, icon: MapPin, officeOnly: true },
  { id: "repair", labelKey: "tabRepair" as const, icon: Wrench, physicalStoreOnly: true },
  { id: "pettycash", labelKey: "tabPettyCash" as const, icon: Banknote },
  { id: "admin", labelKey: "tabAdmin" as const, icon: Settings, managerOrAdminOnly: true },
]

interface AppNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
  ordersBadge?: number
}

export function AppNavigation({ activeTab, onTabChange, ordersBadge = 0 }: AppNavigationProps) {
  const { lang } = useLang()
  const { auth } = useAuth()
  const t = useT(lang)

  const isOffice = hasOfficeStaffScope(auth?.role || "", auth?.store)
  const isAdmin =
    auth?.role &&
    ["director", "officer", "ceo", "hr", "manager"].some((r) =>
      String(auth.role || "").toLowerCase().includes(r)
    )

  const visibleTabs = tabs.filter((tabItem) => {
    const x = tabItem as {
      officeOnly?: boolean
      adminOnly?: boolean
      managerOrAdminOnly?: boolean
      physicalStoreOnly?: boolean
    }
    if (x.officeOnly && !isOffice) return false
    if (x.adminOnly && !isAdmin) return false
    if (x.managerOrAdminOnly && !isAdmin) return false
    if (x.physicalStoreOnly && !isPhysicalStoreForRepair(auth?.store)) return false
    return true
  })

  return (
    <nav className="sticky top-[57px] z-40 border-b border-border/60 bg-card/90 backdrop-blur-md">
      <div className="flex overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => {
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
              <span className="inline-flex items-center gap-1">
                {t(tab.labelKey)}
                {tab.id === "orders" && ordersBadge > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                    {ordersBadge > 99 ? "99+" : ordersBadge}
                  </span>
                ) : null}
              </span>
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
