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

export default function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const { lang, setLang } = useLang()
  const isLoginPage = isSaasAdminLoginPath(pathname)
  const roleAllowed = Boolean(auth && canAccessSaasAdmin(auth.role || ""))
  const [saasScope, setSaasScope] = useState<SaasScopeClientMeta | null>(roleAllowed ? PLATFORM_SCOPE_CLIENT_META : null)

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
    if (roleAllowed) {
      setSaasScope(PLATFORM_SCOPE_CLIENT_META)
      return
    }
    let cancelled = false
    setSaasScope(null)
    void apiFetch("/api/getSaasTenantSettings")
      .then(async (res) => {
        if (cancelled) return
        const json = (await res.json()) as { scope?: SaasScopeClientMeta }
        if (res.ok && json.scope) {
          setSaasScope(json.scope)
          return
        }
        router.replace("/saas-admin/login?msg=no_admin")
      })
      .catch(() => {
        if (!cancelled) router.replace("/saas-admin/login?msg=no_admin")
      })
    return () => {
      cancelled = true
    }
  }, [auth, initialized, isLoginPage, roleAllowed, router])

  if (isLoginPage) return <>{children}</>
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
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SaasScopeProvider>
  )
}
