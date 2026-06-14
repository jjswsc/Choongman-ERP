"use client"

import { appAlert } from "@/lib/app-message"
import { useCallback, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { AiCenterDrawer } from "@/components/ai/ai-center-drawer"
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
import { Bell, Search, User, Smartphone, ArrowLeft, Languages, Download, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang, ADMIN_UI_LANG_OPTIONS } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { LangCode } from "@/lib/lang-context"
import { isFranchiseeRole } from "@/lib/permissions"
import {
  canFranchiseeAggregateAllowedStores,
  FRANCHISEE_AGGREGATE_ALL_STORES_VALUE,
  isFranchiseeAggregateAllStoresView,
} from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import { useAutoTranslate } from "@/lib/auto-translate"
import { copyWindowsInstallerUrl, WINDOWS_ERP_SETUP_PATH } from "@/lib/windows-installer-copy"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useErpNavigation } from "@/lib/erp-navigation"

export function ErpHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { goBack, clearPageCache, closeCurrentPage } = useErpNavigation()
  const { auth, logout, setAuth } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const { enabled: autoTranslateEnabled, setEnabled: setAutoTranslateEnabled } = useAutoTranslate()
  const brand = useAppBrandConfig()
  const { viewStore, setViewStore } = useStoreView()

  const franchiseeSwitchStores = useMemo(() => {
    if (!auth || !isFranchiseeRole(auth.role || "")) return null
    const a = auth.allowedStores
    if (!a || a.length <= 1) return null
    return a
  }, [auth])

  const canFranchiseeAll = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )

  const isLoginPage = pathname === "/admin/login"
  const isDashboard = pathname === "/admin" || pathname === "/admin/"
  const showBackButton = !isLoginPage && !isDashboard
  const erpWindowsDownloadLabel = t("erpWindowsDownload") || "윈도우 ERP 받기"
  const handleErpInstallerCopy = useCallback(async () => {
    const r = await copyWindowsInstallerUrl(WINDOWS_ERP_SETUP_PATH)
    if (r.ok) await appAlert(t("windowsInstallerCopyHint") || "")
    else await appAlert((t("windowsInstallerCopyFail") || "") + r.url)
  }, [t])
  const autoTranslateLabel = t("header_auto_translate")

  const handleLogout = () => {
    clearPageCache()
    logout()
    router.replace("/admin/login")
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-card px-4 print:hidden pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3">
        <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
        {showBackButton && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={goBack}
              title={t("posBack") || "뒤로가기"}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">{t("posBack") || "뒤로가기"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={closeCurrentPage}
              title={t("erpCloseScreen") || "화면 닫기"}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t("erpCloseScreen") || "화면 닫기"}</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
          </>
        )}
        <Link
          href="/"
          className="flex rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={`${brand.appName} · ${t("goToMobile") || "모바일"}`}
        >
          <Smartphone className="h-4 w-4" />
        </Link>
        <Separator orientation="vertical" className="h-5" />
      </div>

      <div className="pointer-events-auto ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 border-sky-600/40 px-2 text-sky-900 hover:bg-sky-50 sm:px-3"
          title={erpWindowsDownloadLabel}
          onClick={() => void handleErpInstallerCopy()}
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{erpWindowsDownloadLabel}</span>
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
        {franchiseeSwitchStores && auth && (
          <>
            <Select
              value={
                canFranchiseeAll && isFranchiseeAggregateAllStoresView(viewStore)
                  ? FRANCHISEE_AGGREGATE_ALL_STORES_VALUE
                  : auth.store || franchiseeSwitchStores[0]
              }
              onValueChange={(v) => {
                if (v === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE) {
                  setViewStore(FRANCHISEE_AGGREGATE_ALL_STORES_VALUE)
                  return
                }
                setViewStore(v)
                setAuth({ ...auth, store: v })
              }}
            >
              <SelectTrigger className="h-8 w-[min(12rem,32vw)] text-xs" aria-label={t("header_view_store")}>
                <SelectValue placeholder={t("header_view_store")} />
              </SelectTrigger>
              <SelectContent>
                {canFranchiseeAll ? (
                  <SelectItem
                    value={FRANCHISEE_AGGREGATE_ALL_STORES_VALUE}
                    className="text-xs font-medium"
                  >
                    {t("store_all_my_franchise_stores")}
                  </SelectItem>
                ) : null}
                {franchiseeSwitchStores.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Separator orientation="vertical" className="mx-1 h-5" />
          </>
        )}
        {/* Language */}
        <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
          <SelectTrigger className="h-8 min-w-[7.5rem] max-w-[10rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_UI_LANG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="mx-1 h-5" />
        {/* Search */}
        <AiCenterDrawer />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          <span className="sr-only">{t("search")}</span>
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="sr-only">{t("header_notifications")}</span>
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
                  {auth?.user ?? t("adminFallbackUser")}
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
