"use client"

import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Bell, Search, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth-context"

const PATH_TITLES: Record<string, string> = {
  "/admin": "대시보드",
  "/admin/notices": "공지사항 관리",
  "/admin/work-log": "업무일지",
  "/admin/items": "품목 관리",
  "/admin/vendors": "거래처 관리",
  "/admin/orders": "주문 승인",
  "/admin/stock": "재고 현황",
  "/admin/inbound": "입고 관리",
  "/admin/outbound": "출고 관리",
  "/admin/employees": "직원 관리",
  "/admin/attendance": "근태/스케줄 관리",
  "/admin/payroll": "급여 관리",
  "/admin/leave": "휴가 관리",
  "/admin/petty-cash": "페티 캐쉬",
  "/admin/store-check": "매장 점검",
  "/admin/store-visit": "매장 방문 현황",
  "/admin/complaints": "컴플레인 일지",
  "/admin/settings": "시스템 설정",
}

export function ErpHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { auth, logout } = useAuth()
  const title = PATH_TITLES[pathname] ?? "관리자"

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-card px-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          <span className="sr-only">검색</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="sr-only">알림</span>
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-xs font-semibold text-foreground">
                  {auth?.user ?? "관리자"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {auth?.store ?? "—"}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">내 계정</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <Link href="/admin/settings">프로필 설정</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <Link href="/admin/settings">비밀번호 변경</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-destructive cursor-pointer"
              onClick={handleLogout}
            >
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
