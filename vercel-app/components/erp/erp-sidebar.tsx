"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Megaphone,
  ClipboardList,
  Package,
  Building2,
  ClipboardCheck,
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
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
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
}

const mainItems: MenuItem[] = [
  { titleKey: "adminDashboard", icon: LayoutDashboard, href: "/admin" },
  { titleKey: "adminNotices", icon: Megaphone, href: "/admin/notices" },
  { titleKey: "adminWorkLog", icon: ClipboardList, href: "/admin/work-log" },
]

const menuSections: MenuSection[] = [
  {
    titleKey: "adminSectionLogistics",
    items: [
      { titleKey: "adminItems", icon: Package, href: "/admin/items" },
      { titleKey: "adminVendors", icon: Building2, href: "/admin/vendors" },
      { titleKey: "adminOrders", icon: ClipboardCheck, href: "/admin/orders", badge: 0, badgeVariant: "destructive" },
      { titleKey: "adminStock", icon: BarChart3, href: "/admin/stock" },
      { titleKey: "adminInbound", icon: ArrowDownToLine, href: "/admin/inbound" },
      { titleKey: "adminOutbound", icon: ArrowUpFromLine, href: "/admin/outbound" },
    ],
  },
  {
    titleKey: "adminSectionHr",
    items: [
      { titleKey: "adminEmployees", icon: Users, href: "/admin/employees" },
      { titleKey: "adminAttendance", icon: CalendarClock, href: "/admin/attendance" },
      { titleKey: "adminLeave", icon: Palmtree, href: "/admin/leave", badge: 0, badgeVariant: "warning" },
    ],
  },
  {
    titleKey: "adminSectionAccounting",
    items: [
      { titleKey: "adminPayroll", icon: Wallet, href: "/admin/payroll" },
      { titleKey: "adminPettyCash", icon: Receipt, href: "/admin/petty-cash" },
    ],
  },
  {
    titleKey: "adminSectionStore",
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

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    adminSectionLogistics: true,
    adminSectionHr: true,
    adminSectionAccounting: true,
    adminSectionStore: true,
  })

  const toggleSection = (titleKey: string) => {
    setExpandedSections((prev) => ({ ...prev, [titleKey]: !prev[titleKey] }))
  }

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0 print:hidden sidebar-dark">
      {/* Logo */}
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex flex-col group-data-[collapsible=icon]:items-center">
          <h1 className="text-sm font-bold text-white tracking-wide group-data-[collapsible=icon]:text-xs">
            CHOONGMAN
          </h1>
          <p className="text-[10px] text-sidebar-foreground/70 tracking-widest mt-0.5 group-data-[collapsible=icon]:hidden">
            ERP MANAGER
          </p>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="flex-1 overflow-y-auto px-2 pb-4">
        <ScrollArea className="h-full">
          <nav className="space-y-1">
            {/* Top-level (no section title) */}
            <div className="mb-1">
              <div className="space-y-0.5">
                {mainItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
                      pathname === item.href
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">{t(item.titleKey)}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Grouped sections */}
            {menuSections.map((section) => {
              const isExpanded = expandedSections[section.titleKey] ?? true
              return (
                <div key={section.titleKey} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.titleKey)}
                    className="flex w-full items-center justify-between rounded-r border-l-2 border-sidebar-foreground/50 bg-sidebar-accent/30 px-3 py-2 text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white transition-colors group-data-[collapsible=icon]:hidden"
                  >
                    {t(section.titleKey)}
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
                            pathname === item.href
                              ? "bg-primary text-primary-foreground font-medium shadow-sm"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                          )}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">
                            {t(item.titleKey)}
                          </span>
                          {item.badge !== undefined && Number(item.badge) > 0 && (
                            <span
                              className={cn(
                                "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold group-data-[collapsible=icon]:hidden",
                                item.badgeVariant === "destructive"
                                  ? "bg-destructive text-destructive-foreground"
                                  : item.badgeVariant === "warning"
                                  ? "bg-warning text-warning-foreground"
                                  : "bg-primary text-primary-foreground"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

          </nav>
        </ScrollArea>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <div className="space-y-0.5">
          <Link
            href="/admin/settings"
            className={cn(
              "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
              pathname === "/admin/settings"
                ? "bg-primary text-primary-foreground font-medium shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">{t("adminSettings")}</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">{t("logout")}</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
