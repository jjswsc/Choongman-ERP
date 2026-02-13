"use client"

import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Bell, Search, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { LangCode } from "@/lib/lang-context"

const PATH_KEYS: Record<string, string> = {
  "/admin": "adminDashboard",
  "/admin/notices": "adminNotices",
  "/admin/work-log": "adminWorkLog",
  "/admin/items": "adminItems",
  "/admin/vendors": "adminVendors",
  "/admin/orders": "adminOrders",
  "/admin/stock": "adminStock",
  "/admin/inbound": "adminInbound",
  "/admin/outbound": "adminOutbound",
  "/admin/employees": "adminEmployees",
  "/admin/attendance": "adminAttendance",
  "/admin/payroll": "adminPayroll",
  "/admin/leave": "adminLeave",
  "/admin/petty-cash": "adminPettyCash",
  "/admin/store-check": "adminStoreCheck",
  "/admin/store-visit": "adminStoreVisit",
  "/admin/complaints": "adminComplaints",
  "/admin/settings": "adminSettings",
}

const LANG_OPTIONS: { value: LangCode; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "th", label: "ไทย" },
  { value: "mm", label: "မြန်မာ" },
  { value: "la", label: "ລາວ" },
]

export function ErpHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { auth, logout } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const pathKey = PATH_KEYS[pathname]
  const title = pathKey ? t(pathKey) : t("adminDashboard")

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
        {/* Language */}
        <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
          <SelectTrigger className="h-8 w-[7rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="mx-1 h-5" />
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
            <DropdownMenuLabel className="text-xs">{t("adminMyAccount")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <Link href="/admin/settings">{t("adminProfile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <Link href="/admin/settings">{t("adminChangePw")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-destructive cursor-pointer"
              onClick={handleLogout}
            >
              {t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
