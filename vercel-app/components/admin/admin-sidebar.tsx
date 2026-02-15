"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

const menuItems = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/notices", label: "공지사항 관리" },
  { href: "/admin/work-log", label: "업무일지" },
  { header: "물류 관리" },
  { href: "/admin/items", label: "품목 관리" },
  { href: "/admin/vendors", label: "거래처 관리" },
  { href: "/admin/orders", label: "주문 승인" },
  { href: "/admin/stock", label: "재고 현황" },
  { href: "/admin/inbound", label: "입고 관리" },
  { href: "/admin/outbound", label: "출고 관리" },
  { header: "인사 관리" },
  { href: "/admin/employees", label: "직원 관리" },
  { href: "/admin/attendance", label: "근태/스케줄 관리" },
  { href: "/admin/leave", label: "휴가 관리" },
  { header: "회계 관리" },
  { href: "/admin/payroll", label: "급여 관리" },
  { href: "/admin/petty-cash", label: "패티 캐쉬" },
  { header: "매장 관리" },
  { href: "/admin/store-check", label: "매장 점검" },
  { href: "/admin/store-visit", label: "매장 방문 현황" },
  { href: "/admin/complaints", label: "컴플레인 일지" },
  { header: "설정" },
  { href: "/admin/settings", label: "설정" },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-black/40 bg-[#0a0a0a]">
      {/* Logo / Title */}
      <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
          <img src="/img/logo.png" alt="CHOONGMAN CHICKEN" className="h-full w-full object-contain" />
        </div>
        <span className="truncate font-bold text-white">충만치킨 ERP</span>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        {menuItems.map((item, i) => {
          if ("header" in item) {
            return (
              <div
                key={i}
                className="mx-2 mb-1 mt-5 flex items-center gap-3 rounded-lg border-l-4 border-amber-400/70 bg-white/5 px-3 py-2.5"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/90">
                  {item.header}
                </span>
              </div>
            )
          }
          const isActive = pathname === item.href
          return (
            <Link
              key={i}
              href={item.href}
              className={cn(
                "mx-2 block rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-white",
                isActive
                  ? "border-l-4 border-white/60 bg-white/10"
                  : "border-l-4 border-transparent hover:bg-white/5"
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/10 p-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-lg text-white hover:bg-white/5"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </div>
    </aside>
  )
}
