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
import { Bell, User, Smartphone, ArrowLeft, Languages } from "lucide-react"
import { usePointerCoarse } from "@/hooks/use-pointer-coarse"
import { cn } from "@/lib/utils"
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
    if (!Array.isArray(a) || a.length <= 1) return null
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
  const pointerCoarse = usePointerCoarse()
  const iconBtnCn = cn(
    "shrink-0 text-muted-foreground hover:text-foreground",
    pointerCoarse ? "h-10 w-10" : "h-8 w-8"
  )

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-border bg-muted px-1.5 shadow-sm print:hidden pointer-events-none sm:gap-1.5 sm:px-3 max-md:h-14">
      <div className="pointer-events-auto flex min-w-0 flex-1 items-end gap-0.5 self-stretch pt-1.5 sm:gap-1">
        <div className="mb-0.5 flex shrink-0 items-center gap-0.5">
          <SidebarTrigger className={cn(iconBtnCn, "hover:bg-transparent")} />
          {showBackButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(iconBtnCn, "hover:bg-background/80")}
              onClick={goBack}
              title={t("posBack") || "뒤로가기"}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t("posBack") || "뒤로가기"}</span>
            </Button>
          ) : null}
        </div>
        {!isLoginPage ? (
          <Suspense fallback={<div className="min-w-0 flex-1" aria-hidden />}>
            <ErpWorkspaceTabs />
          </Suspense>
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {/* 커버: 현장 모바일·자동번역은 계정 메뉴로 옮겨 탭 공간 확보 */}
        <Link
          href="/"
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:flex lg:hidden",
            pointerCoarse ? "h-10" : "h-8"
          )}
          title={`${brand.appName} · ${staffMobileLabel}`}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
        </Link>
        <Button
          type="button"
          variant={autoTranslateEnabled ? "default" : "outline"}
          size="sm"
          className={cn(
            "hidden gap-1 px-1.5 text-xs sm:inline-flex sm:gap-1.5 sm:px-2",
            pointerCoarse ? "h-10" : "h-8"
          )}
          onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
          title={`${autoTranslateLabel} ${autoTranslateEnabled ? "ON" : "OFF"}`}
        >
          <Languages className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">{autoTranslateLabel}</span>
          <span className="text-[10px] font-semibold">{autoTranslateEnabled ? "ON" : "OFF"}</span>
        </Button>
        <Separator orientation="vertical" className="mx-0.5 hidden h-5 md:block" />
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
              <SelectTrigger
                className={cn(
                  "w-[min(7.5rem,26vw)] text-xs sm:w-[min(12rem,32vw)]",
                  pointerCoarse ? "h-10" : "h-8"
                )}
                aria-label={t("header_view_store")}
              >
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
            <Separator orientation="vertical" className="mx-0.5 hidden h-5 sm:block" />
          </>
        )}
        <Select
          value={lang}
          onValueChange={(v) => {
            invalidateKeepAliveCaches()
            setLang(v as LangCode)
          }}
        >
          <SelectTrigger
            className={cn(
              "min-w-[2.75rem] max-w-[4.2rem] px-1.5 text-xs sm:min-w-[5.25rem] sm:max-w-[7rem]",
              pointerCoarse ? "h-10" : "h-8"
            )}
          >
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
        <Separator orientation="vertical" className="mx-0.5 hidden h-5 sm:block" />
        <Button
          variant="ghost"
          size="icon"
          className={cn("hidden text-muted-foreground hover:text-foreground sm:inline-flex", iconBtnCn)}
        >
          <Bell className="h-4 w-4" />
          <span className="sr-only">{t("header_notifications")}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-1 text-muted-foreground hover:text-foreground sm:px-1.5",
                pointerCoarse ? "h-10" : "h-8"
              )}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground sm:h-7 sm:w-7">
                <User className="h-3.5 w-3.5" />
              </div>
              <div className="hidden flex-col items-start md:flex">
                <span className="text-xs font-semibold leading-tight text-foreground">
                  {auth?.user ?? t("adminFallbackUser")}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {auth?.store ?? "—"}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs">{t("adminMyAccount")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-xs cursor-pointer sm:hidden">
              <Link href="/">
                <Smartphone className="mr-2 h-3.5 w-3.5" />
                {staffMobileLabel}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs cursor-pointer sm:hidden"
              onClick={() => setAutoTranslateEnabled(!autoTranslateEnabled)}
            >
              <Languages className="mr-2 h-3.5 w-3.5" />
              {autoTranslateLabel} {autoTranslateEnabled ? "ON" : "OFF"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="sm:hidden" />
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
