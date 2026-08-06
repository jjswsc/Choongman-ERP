"use client"

import { Suspense, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
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
import { Bell, Search, User, Smartphone, ArrowLeft, Languages } from "lucide-react"
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
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useErpNavigation } from "@/lib/erp-navigation"
import { ErpWorkspaceTabs } from "@/components/erp/erp-workspace-tabs"

export function ErpHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { goBack, clearPageCache, invalidateKeepAliveCaches } = useErpNavigation()
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
  const showBackButton = !isLoginPage
  const autoTranslateLabel = t("header_auto_translate")

  const handleLogout = () => {
    clearPageCache()
    logout()
    router.replace("/admin/login")
  }

  const staffMobileLabel = t("goToStaffMobile") || t("goToMobile") || "현장 모바일"

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-card px-2 print:hidden pointer-events-none sm:gap-2 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <SidebarTrigger className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground md:h-8 md:w-8" />
        {showBackButton && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
            onClick={goBack}
            title={t("posBack") || "뒤로가기"}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">{t("posBack") || "뒤로가기"}</span>
          </Button>
        )}
        {!isLoginPage ? (
          <>
            <Separator orientation="vertical" className="hidden h-5 shrink-0 sm:block" />
            <Suspense fallback={<div className="min-w-0 flex-1" aria-hidden />}>
              <ErpWorkspaceTabs />
            </Suspense>
          </>
        ) : null}
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <Link
          href="/"
          className="flex h-10 shrink-0 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground sm:h-auto sm:p-2 lg:hidden"
          title={`${brand.appName} · ${staffMobileLabel}`}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
          <span className="max-w-[4.5rem] truncate text-[10px] font-medium sm:hidden">
            {staffMobileLabel}
          </span>
        </Link>
        <Button
          type="button"
          variant={autoTranslateEnabled ? "default" : "outline"}
          size="sm"
          className="h-10 gap-1 px-2 text-xs sm:h-8 sm:gap-1.5"
          onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
          title={`${autoTranslateLabel} ${autoTranslateEnabled ? "ON" : "OFF"}`}
        >
          <Languages className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">{autoTranslateLabel}</span>
          <span className="text-[10px] font-semibold">{autoTranslateEnabled ? "ON" : "OFF"}</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 hidden h-5 md:block" />
        {franchiseeSwitchStores && auth && (
          <>
            <Select
              value={
                canFranchiseeAll && isFranchiseeAggregateAllStoresView(viewStore)
                  ? FRANCHISEE_AGGREGATE_ALL_STORES_VALUE
                  : auth.store || franchiseeSwitchStores[0]
              }
              onValueChange={(v) => {
                invalidateKeepAliveCaches()
                if (v === FRANCHISEE_AGGREGATE_ALL_STORES_VALUE) {
                  setViewStore(FRANCHISEE_AGGREGATE_ALL_STORES_VALUE)
                  return
                }
                setViewStore(v)
                setAuth({ ...auth, store: v })
              }}
            >
              <SelectTrigger className="h-10 w-[min(9rem,28vw)] text-xs sm:h-8 sm:w-[min(12rem,32vw)]" aria-label={t("header_view_store")}>
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
            <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
          </>
        )}
        <Select
          value={lang}
          onValueChange={(v) => {
            invalidateKeepAliveCaches()
            setLang(v as LangCode)
          }}
        >
          <SelectTrigger className="h-10 min-w-[4.5rem] max-w-[7rem] text-xs sm:h-8 sm:min-w-[7.5rem] sm:max-w-[10rem]">
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
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <div className="hidden sm:contents">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="sr-only">{t("search")}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            <span className="sr-only">{t("header_notifications")}</span>
          </Button>

          <Separator orientation="vertical" className="mx-1 h-5" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-10 items-center gap-2 rounded-lg px-1.5 text-muted-foreground hover:text-foreground sm:h-8 sm:px-2"
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
