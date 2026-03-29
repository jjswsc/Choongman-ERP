"use client"

import { appAlert } from "@/lib/app-message"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Bell, Search, User, Smartphone, ArrowLeft, HardDriveDownload, Languages } from "lucide-react"
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
import { useStoreList } from "@/lib/api-client"
import { isOfficeRole } from "@/lib/permissions"
import { warmAdminOfflineCache } from "@/lib/offline/pos-offline-warm"
import { useAutoTranslate } from "@/lib/auto-translate"

const LANG_OPTIONS: { value: LangCode; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "th", label: "ไทย" },
  { value: "mm", label: "မြန်မာ" },
  { value: "la", label: "ລາວ" },
  { value: "kh", label: "ខ្មែរ" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "ms", label: "Bahasa Melayu" },
]

const ERP_HISTORY_KEY_CURR = "erp_back_curr"
const ERP_HISTORY_KEY_PREV = "erp_back_prev"

export function ErpHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, logout } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const { enabled: autoTranslateEnabled, setEnabled: setAutoTranslateEnabled } = useAutoTranslate()
  const { stores } = useStoreList()
  const [prefetchBusy, setPrefetchBusy] = useState(false)
  const warmStoreCodes = useMemo(() => {
    if (isOfficeRole(auth?.role || "")) return stores
    if (auth?.store) return [auth.store]
    return stores.length ? [stores[0]] : []
  }, [auth?.role, auth?.store, stores])
  const handlePrefetchOffline = useCallback(async () => {
    setPrefetchBusy(true)
    const r = await warmAdminOfflineCache({ storeCodes: warmStoreCodes })
    setPrefetchBusy(false)
    if (r.ok) await appAlert(t("posOfflinePrefetchDone"))
    else
      await appAlert(
        (t("posOfflinePrefetchFail") || "") +
          (r.errors.length ? ` (${r.errors.slice(0, 4).join(", ")})` : "")
      )
  }, [warmStoreCodes, t])
  const isLoginPage = pathname === "/admin/login"
  const isDashboard = pathname === "/admin" || pathname === "/admin/"
  const showBackButton = !isLoginPage && !isDashboard
  const offlinePrefetchTitle =
    t("adminOfflinePrefetchTitle") || t("posOfflinePrefetchTitle") || ""
  const autoTranslateLabel = lang === "ko" ? "자동번역" : "Auto translate"

  // ERP 내 이동 시 이전/현재 경로 저장 (뒤로가기용)
  useEffect(() => {
    if (typeof window === "undefined" || !pathname || isLoginPage) return
    if (!pathname.startsWith("/admin")) return
    const curr = sessionStorage.getItem(ERP_HISTORY_KEY_CURR)
    if (curr !== pathname) {
      sessionStorage.setItem(ERP_HISTORY_KEY_PREV, curr || "")
      sessionStorage.setItem(ERP_HISTORY_KEY_CURR, pathname)
    }
  }, [pathname, isLoginPage])

  const handleBack = () => {
    const prev = sessionStorage.getItem(ERP_HISTORY_KEY_PREV)
    if (prev && prev !== pathname && prev.startsWith("/admin")) {
      router.push(prev)
      return
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push("/admin")
  }

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-card px-4 print:hidden">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
        {showBackButton && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleBack}
              title={t("posBack") || "뒤로가기"}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">{t("posBack") || "뒤로가기"}</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}
        <Link
          href="/"
          className="flex rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("goToMobile") || "모바일"}
        >
          <Smartphone className="h-4 w-4" />
        </Link>
        <Separator orientation="vertical" className="h-5" />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 border-emerald-600/40 px-2 text-emerald-800 hover:bg-emerald-50 sm:px-3"
          disabled={prefetchBusy}
          title={offlinePrefetchTitle}
          onClick={() => void handlePrefetchOffline()}
        >
          <HardDriveDownload className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            {prefetchBusy ? t("posOfflinePrefetching") : t("posOfflinePrefetch")}
          </span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          type="button"
          variant={autoTranslateEnabled ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
          title={`${autoTranslateLabel} ${autoTranslateEnabled ? "ON" : "OFF"}`}
        >
          <Languages className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">{autoTranslateLabel}</span>
          <span className="text-[10px] font-semibold">{autoTranslateEnabled ? "ON" : "OFF"}</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
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
              <Link href="/admin/profile">{t("adminProfile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <Link href="/admin/profile">{t("adminChangePw")}</Link>
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
