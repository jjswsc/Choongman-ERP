"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calendar,
  HandCoins,
  LayoutGrid,
  LayoutPanelTop,
  PackageSearch,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: INTERIOR_ADMIN.hub, titleKey: "adminInteriorProjects" as const, icon: LayoutGrid },
  { href: INTERIOR_ADMIN.schedule, titleKey: "interiorSchedule" as const, icon: Calendar },
  { href: INTERIOR_ADMIN.vendors, titleKey: "interiorVendorsHub" as const, icon: HandCoins },
  { href: INTERIOR_ADMIN.specs, titleKey: "interiorHubSpecs" as const, icon: PackageSearch },
  { href: INTERIOR_ADMIN.drawings, titleKey: "interiorHubDrawings" as const, icon: LayoutPanelTop },
  { href: INTERIOR_ADMIN.kitchen, titleKey: "interiorKitchen" as const, icon: UtensilsCrossed },
  { href: INTERIOR_ADMIN.costs, titleKey: "interiorHubCosts" as const, icon: Wallet },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === INTERIOR_ADMIN.hub) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`)
}

export function InteriorSubnav() {
  const pathname = usePathname()
  const t = useT(useLang().lang)

  return (
    <nav
      className="mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-3"
      aria-label={t("interiorSubnavAria")}
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
