"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Layers, LayoutDashboard, Radio } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin/live-store-sales", titleKey: "adminLiveStoreSales" as const, icon: Radio },
  { href: "/admin/ops-center", titleKey: "adminOpsCenter" as const, icon: LayoutDashboard },
  { href: "/admin/sales-management", titleKey: "adminSalesManagement" as const, icon: BarChart3 },
  { href: "/admin/total-sales", titleKey: "adminTotalSales" as const, icon: Layers },
] as const

export function SalesSubnav() {
  const pathname = usePathname()
  const t = useT(useLang().lang)

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border/60 pb-3"
      aria-label={t("salesSubnavAria")}
    >
      {ITEMS.map(({ href, titleKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
