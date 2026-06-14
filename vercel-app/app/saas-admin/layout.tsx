"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { useLang, normalizeAdminUiLang } from "@/lib/lang-context"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { apiFetch } from "@/lib/api/fetch"
import { SaasSidebar } from "@/components/saas/saas-sidebar"
import { SaasHeader } from "@/components/saas/saas-header"
import { SaasScopeLoader } from "@/components/saas/saas-scope-loader"

export default function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const { lang, setLang } = useLang()
  const isLoginPage = pathname === "/saas-admin/login"
  const roleAllowed = Boolean(auth && canAccessSaasAdmin(auth.role || ""))
  const [partnerGateOk, setPartnerGateOk] = useState<boolean | null>(roleAllowed ? true : null)

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
      setPartnerGateOk(true)
      return
    }
    let cancelled = false
    setPartnerGateOk(null)
    void apiFetch("/api/getSaasTenantSettings")
      .then((res) => {
        if (cancelled) return
        if (res.ok) setPartnerGateOk(true)
        else router.replace("/saas-admin/login?msg=no_admin")
      })
      .catch(() => {
        if (!cancelled) router.replace("/saas-admin/login?msg=no_admin")
      })
    return () => {
      cancelled = true
    }
  }, [auth, initialized, isLoginPage, roleAllowed, router])

  if (isLoginPage) return <>{children}</>
  if (!initialized || !auth || partnerGateOk !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <SaasScopeLoader>
      <SidebarProvider>
        <SaasSidebar />
        <SidebarInset>
          <SaasHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </SaasScopeLoader>
  )
}
