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
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-700/50 bg-slate-900">
      {/* Logo / Title */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-700/50 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <span className="text-xs font-bold text-primary-foreground">CM</span>
        </div>
        <span className="truncate font-semibold text-white">충만치킨 ERP</span>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        {menuItems.map((item, i) => {
          if ("header" in item) {
            return (
              <div
                key={i}
                className="mb-1 mt-4 px-4 text-xs font-medium uppercase tracking-wider text-slate-500 first:mt-0"
              >
                {item.header}
              </div>
            )
          }
          const isActive = pathname === item.href
          return (
            <Link
              key={i}
              href={item.href}
              className={cn(
                "block px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-l-2 border-primary bg-slate-800/80 text-primary"
                  : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-700/50 p-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </div>
    </aside>
  )
}
