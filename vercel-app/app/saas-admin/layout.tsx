"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { useLang, normalizeAdminUiLang } from "@/lib/lang-context"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { apiFetch } from "@/lib/api/fetch"
import { PLATFORM_SCOPE_CLIENT_META, type SaasScopeClientMeta } from "@/lib/saas-control-plane-scope-client"
import { isSaasAdminLoginPath } from "@/lib/saas-partner-login-defaults-client"
import { SaasSidebar } from "@/components/saas/saas-sidebar"
import { SaasHeader } from "@/components/saas/saas-header"
import { SaasScopeProvider } from "@/components/saas/saas-scope-context"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useT } from "@/lib/i18n"

export default function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const brand = useAppBrandConfig()
  const isLoginPage = isSaasAdminLoginPath(pathname)
  const roleAllowed = Boolean(auth && canAccessSaasAdmin(auth.role || ""))
  /** 서버 resolveSaasScope와 맞춤 — HQ 역할이어도 대리점 연결이면 partner */
  const [saasScope, setSaasScope] = useState<SaasScopeClientMeta | null>(null)
  const isOmniBrand = brand.key === "omnifoodtech"

  useEffect(() => {
    const n = normalizeAdminUiLang(lang)
    if (n !== lang) setLang(n)
  }, [lang, setLang])

  useEffect(() => {
    if (!initialized || isLoginPage) return
    if (!auth) {
      router.replace("/saas-admin/login")
      return
    }
    let cancelled = false
    setSaasScope(null)
    void apiFetch("/api/saasAdminScope")
      .then(async (res) => {
        if (cancelled) return
        const json = (await res.json()) as { scope?: SaasScopeClientMeta; success?: boolean }
        if (json.scope) {
          setSaasScope(json.scope)
          return
        }
        if (roleAllowed && res.ok) {
          setSaasScope(PLATFORM_SCOPE_CLIENT_META)
          return
        }
        if (res.ok) return
        router.replace("/saas-admin/login?msg=no_admin")
      })
      .catch(() => {
        if (cancelled) return
        if (roleAllowed) {
          setSaasScope(PLATFORM_SCOPE_CLIENT_META)
          return
        }
        router.replace("/saas-admin/login?msg=no_admin")
      })
    return () => {
      cancelled = true
    }
  }, [auth, initialized, isLoginPage, roleAllowed, router])

  if (isLoginPage) {
    if (!isOmniBrand) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-slate-100">
          <p className="text-lg font-semibold">{t("saasAdminOmniOnlyTitle")}</p>
          <p className="max-w-md text-sm text-slate-300">{t("saasAdminOmniOnlyBody")}</p>
        </div>
      )
    }
    return <>{children}</>
  }

  /** 충만(Choongman) 배포에서는 SaaS Admin UI를 쓰지 않음 — 혼동 방지 */
  if (!isOmniBrand) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-slate-100">
        <p className="text-lg font-semibold">{t("saasAdminOmniOnlyTitle")}</p>
        <p className="max-w-md text-sm text-slate-300">{t("saasAdminOmniOnlyBody")}</p>
      </div>
    )
  }

  if (!initialized || !auth || !saasScope) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <SaasScopeProvider scope={saasScope}>
      <SidebarProvider>
        <SaasSidebar />
        <SidebarInset>
          <SaasHeader />
          <div className="border-b border-sky-500/30 bg-sky-950/40 px-4 py-1.5 text-center text-[11px] text-sky-100/90 print:hidden">
            {t("saasAdminOmniBanner")}
          </div>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SaasScopeProvider>
  )
}
