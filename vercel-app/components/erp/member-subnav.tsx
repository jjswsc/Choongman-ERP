"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const items = [
  { href: "/admin/members", label: "회원 리스트" },
  { href: "/admin/members/line", label: "LINE 회원" },
  { href: "/admin/members/points", label: "포인트" },
  { href: "/admin/members/coupons", label: "쿠폰" },
  { href: "/admin/members/visits", label: "방문 기록" },
  { href: "/admin/members/tiers", label: "등급 관리" },
]

export function MemberSubnav() {
  const pathname = usePathname()
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
          {item.label}
        </Link>
      ))}
    </div>
  )
}
