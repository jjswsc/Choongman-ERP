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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface MenuItem {
  titleKey: string
  icon: React.ElementType
  href: string
  badge?: number | string
  badgeVariant?: "default" | "destructive" | "warning"
}

interface MenuSection {
  titleKey: string
  items: MenuItem[]
  defaultOpen?: boolean
}

const mainItems: MenuItem[] = [
  { titleKey: "adminDashboard", icon: LayoutDashboard, href: "/admin" },
  { titleKey: "adminNotices", icon: Megaphone, href: "/admin/notices" },
  { titleKey: "adminWorkLog", icon: ClipboardList, href: "/admin/work-log" },
]

const menuSections: MenuSection[] = [
  {
    titleKey: "adminSectionLogistics",
    defaultOpen: true,
    items: [
      { titleKey: "adminItems", icon: Tags, href: "/admin/items" },
      { titleKey: "adminVendors", icon: Building2, href: "/admin/vendors" },
      { titleKey: "adminOrders", icon: ShieldCheck, href: "/admin/orders", badge: 0, badgeVariant: "destructive" },
      { titleKey: "adminStock", icon: BarChart3, href: "/admin/stock" },
      { titleKey: "adminInbound", icon: ArrowDownToLine, href: "/admin/inbound" },
      { titleKey: "adminOutbound", icon: ArrowUpFromLine, href: "/admin/outbound" },
    ],
  },
  {
    titleKey: "adminSectionHr",
    defaultOpen: true,
    items: [
      { titleKey: "adminEmployees", icon: Users, href: "/admin/employees" },
      { titleKey: "adminAttendance", icon: CalendarClock, href: "/admin/attendance" },
      { titleKey: "adminPayroll", icon: Wallet, href: "/admin/payroll" },
      { titleKey: "adminLeave", icon: Palmtree, href: "/admin/leave", badge: 0, badgeVariant: "warning" },
    ],
  },
  {
    titleKey: "adminSectionAccounting",
    defaultOpen: true,
    items: [
      { titleKey: "adminPettyCash", icon: Receipt, href: "/admin/petty-cash" },
    ],
  },
  {
    titleKey: "adminSectionStore",
    defaultOpen: true,
    items: [
      { titleKey: "adminStoreCheck", icon: Store, href: "/admin/store-check" },
      { titleKey: "adminStoreVisit", icon: MapPin, href: "/admin/store-visit" },
      { titleKey: "adminComplaints", icon: MessageSquareWarning, href: "/admin/complaints" },
    ],
  },
]

export function ErpSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0 sidebar-dark">
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
            <span className="text-[10px] font-semibold tracking-[0.2em] text-sidebar-foreground/70">
              CM ERP SYSTEM
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
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={t(item.titleKey)}>
                    <Link
                      href={item.href}
                      className={cn(
                        "h-9 transition-all",
                        pathname === item.href &&
                          "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {/* Grouped sections - 바 형식 섹션 헤더 */}
          {menuSections.map((section) => (
            <SidebarGroup key={section.titleKey}>
              <Collapsible defaultOpen={section.defaultOpen} className="group/collapsible">
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg border-l-4 border-slate-500 bg-white/5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground hover:bg-white/10 transition-colors group-data-[collapsible=icon]:px-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    <span className="flex-1 text-left">{t(section.titleKey)}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={t(item.titleKey)}>
                            <Link
                              href={item.href}
                              className={cn(
                                "h-9 transition-all",
                                pathname === item.href &&
                                  "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                              <span className="flex-1">{t(item.titleKey)}</span>
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

          {/* Settings - 바 형식 */}
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-3 rounded-lg border-l-4 border-slate-500 bg-white/5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground group-data-[collapsible=icon]:px-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              {t("adminSectionSettings")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t("adminSettings")}>
                    <Link href="/admin/settings">
                      <Settings className="h-4 w-4" />
                      <span>{t("adminSettings")}</span>
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
            <SidebarMenuButton asChild tooltip={t("adminChangePw")} className="h-9">
              <Link href="/admin/settings">
                <Lock className="h-4 w-4" />
                <span>{t("adminChangePw")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={t("logout")}
              className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>{t("logout")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
