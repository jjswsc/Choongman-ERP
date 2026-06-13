"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDays,
  FileText,
  Handshake,
  LayoutDashboard,
  Megaphone,
  Package,
  Settings2,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin/marketing", titleKey: "marketingHomeTitle" as const, icon: LayoutDashboard },
  { href: "/admin/marketing/campaigns", titleKey: "adminMarketingCampaigns" as const, icon: Megaphone },
  { href: "/admin/marketing/collab-menus", titleKey: "adminMarketingCollabMenus" as const, icon: Handshake },
  { href: "/admin/marketing/promos", titleKey: "adminMarketingPromos" as const, icon: Tag },
  { href: "/admin/marketing/ads", titleKey: "adminMarketingAds" as const, icon: TrendingUp },
  { href: "/admin/marketing/influencers", titleKey: "adminMarketingInfluencers" as const, icon: Users },
  { href: "/admin/marketing/materials", titleKey: "adminMarketingMaterials" as const, icon: Package },
  { href: "/admin/marketing/calendar", titleKey: "adminMarketingCalendar" as const, icon: CalendarDays },
  { href: "/admin/marketing/report", titleKey: "adminMarketingReportHubTitle" as const, icon: FileText },
  { href: "/admin/marketing/integrations", titleKey: "adminMarketingIntegrations" as const, icon: Settings2 },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/marketing") {
    return pathname === href
  }
  if (href === "/admin/marketing/campaigns") {
    return pathname === href || pathname.startsWith(`${href}?`)
  }
  if (href === "/admin/marketing/report") {
    return pathname.startsWith("/admin/marketing/report") || pathname.startsWith("/admin/marketing/dashboard") || pathname.startsWith("/admin/marketing/costs")
  }
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`)
}

export function MarketingSubnav() {
  const pathname = usePathname()
  const t = useT(useLang().lang)

  return (
    <nav
      className="mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-3"
      aria-label={t("marketingSubnavAria")}
    >
      {ITEMS.map(({ href, titleKey, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t(titleKey)}
          </Link>
        )
      })}
    </nav>
  )
}
