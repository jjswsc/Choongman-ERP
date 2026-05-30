"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

const items: Array<{ href: string; key: string; label?: string }> = [
  { href: "/admin/crm", key: "adminCrmDashboard" },
  { href: "/admin/members", key: "memberList" },
  { href: "/admin/members/points", key: "memberPoints" },
  { href: "/admin/members/coupons", key: "memberCoupons" },
  { href: "/admin/members/visits", key: "memberVisits" },
  { href: "/admin/members/tiers", key: "memberTiers" },
  { href: "/admin/crm/segments", key: "adminCrmSegments" },
  { href: "/admin/crm/rfm", key: "adminCrmRfm" },
  { href: "/admin/crm/member-app", key: "memberAppContent", label: "회원앱 운영" },
]

export function CrmSubnav() {
  const pathname = usePathname()
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm",
            pathname === item.href ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          {item.label || t(item.key)}
        </Link>
      ))}
    </div>
  )
}
