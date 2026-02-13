"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  ClipboardList,
  Package,
  Tags,
  Building2,
  ShieldCheck,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  CalendarClock,
  Wallet,
  Palmtree,
  Receipt,
  Store,
  MapPin,
  MessageSquareWarning,
  Settings,
  Lock,
  LogOut,
  ChevronDown,
  Building,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"

interface MenuItem {
  title: string
  icon: React.ElementType
  href: string
  badge?: number | string
  badgeVariant?: "default" | "destructive" | "warning"
}

interface MenuSection {
  title: string
  items: MenuItem[]
  defaultOpen?: boolean
}

const mainItems: MenuItem[] = [
  { title: "대시보드", icon: LayoutDashboard, href: "/admin" },
  { title: "공지사항 관리", icon: Megaphone, href: "/admin/notices" },
  { title: "업무일지", icon: ClipboardList, href: "/admin/work-log" },
]

const menuSections: MenuSection[] = [
  {
    title: "물류 관리",
    defaultOpen: true,
    items: [
      { title: "품목 관리", icon: Tags, href: "/admin/items" },
      { title: "거래처 관리", icon: Building2, href: "/admin/vendors" },
      { title: "주문 승인", icon: ShieldCheck, href: "/admin/orders", badge: 0, badgeVariant: "destructive" },
      { title: "재고 현황", icon: BarChart3, href: "/admin/stock" },
      { title: "입고 관리", icon: ArrowDownToLine, href: "/admin/inbound" },
      { title: "출고 관리", icon: ArrowUpFromLine, href: "/admin/outbound" },
    ],
  },
  {
    title: "인사 관리",
    defaultOpen: true,
    items: [
      { title: "직원 관리", icon: Users, href: "/admin/employees" },
      { title: "근태/스케줄 관리", icon: CalendarClock, href: "/admin/attendance" },
      { title: "급여 관리", icon: Wallet, href: "/admin/payroll" },
      { title: "휴가 관리", icon: Palmtree, href: "/admin/leave", badge: 0, badgeVariant: "warning" },
    ],
  },
  {
    title: "회계 관리",
    defaultOpen: true,
    items: [
      { title: "페티 캐쉬", icon: Receipt, href: "/admin/petty-cash" },
    ],
  },
  {
    title: "매장 관리",
    defaultOpen: true,
    items: [
      { title: "매장 점검", icon: Store, href: "/admin/store-check" },
      { title: "매장 방문 현황", icon: MapPin, href: "/admin/store-visit" },
      { title: "컴플레인 일지", icon: MessageSquareWarning, href: "/admin/complaints" },
    ],
  },
]

export function ErpSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Header / Logo */}
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-tight text-sidebar-primary-foreground">
              CHOONGMAN
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
              ERP Manager
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main Content */}
      <SidebarContent>
        <ScrollArea className="flex-1">
          {/* Top-level navigation */}
          <SidebarGroup>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                    <Link
                      href={item.href}
                      className={cn(
                        "h-9 transition-all",
                        pathname === item.href &&
                          "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {/* Grouped sections */}
          {menuSections.map((section) => (
            <SidebarGroup key={section.title}>
              <Collapsible defaultOpen={section.defaultOpen} className="group/collapsible">
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors">
                    <span>{section.title}</span>
                    <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                            <Link
                              href={item.href}
                              className={cn(
                                "h-9 transition-all",
                                pathname === item.href &&
                                  "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                              <span className="flex-1">{item.title}</span>
                              {item.badge !== undefined && Number(item.badge) > 0 && (
                                <span
                                  className={cn(
                                    "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                                    item.badgeVariant === "destructive"
                                      ? "bg-destructive text-destructive-foreground"
                                      : item.badgeVariant === "warning"
                                      ? "bg-warning text-warning-foreground"
                                      : "bg-sidebar-primary text-sidebar-primary-foreground"
                                  )}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          ))}

          {/* Settings */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              설정
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="설정">
                    <Link href="/admin/settings">
                      <Settings className="h-4 w-4" />
                      <span>시스템 설정</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer */}
      <SidebarFooter className="px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="비밀번호 변경" className="h-9">
              <Link href="/admin/settings">
                <Lock className="h-4 w-4" />
                <span>비밀번호 변경</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="로그아웃"
              className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
