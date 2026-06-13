"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Palmtree,
  Users,
  Wallet,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin/hr", titleKey: "adminHrHome" as const, icon: LayoutDashboard },
  { href: "/admin/employees", titleKey: "adminEmployees" as const, icon: Users },
  { href: "/admin/hr-policies", titleKey: "adminHrPolicies" as const, icon: BookOpen },
  { href: "/admin/hr-calendar", titleKey: "adminHrCalendar" as const, icon: CalendarDays },
  { href: "/admin/attendance", titleKey: "adminAttendance" as const, icon: CalendarClock },
  { href: "/admin/leave", titleKey: "adminLeave" as const, icon: Palmtree },
  { href: "/admin/payroll", titleKey: "adminPayroll" as const, icon: Wallet },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/hr") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`)
}

export function HrSubnav() {
  const pathname = usePathname()
  const t = useT(useLang().lang)

  return (
    <nav
      className="mb-4 flex flex-wrap gap-1 border-b border-border/60 pb-3"
      aria-label={t("hrSubnavAria")}
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
