"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth-context"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { SaasSidebar } from "@/components/saas/saas-sidebar"
import { SaasHeader } from "@/components/saas/saas-header"

export default function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, initialized } = useAuth()
  const isLoginPage = pathname === "/saas-admin/login"

  useEffect(() => {
    if (!initialized || isLoginPage) return
    if (!auth) {
      router.replace("/saas-admin/login")
      return
    }
    if (!canAccessSaasAdmin(auth.role || "")) {
      router.replace("/saas-admin/login?msg=no_admin")
    }
  }, [auth, initialized, isLoginPage, router])

  if (isLoginPage) return <>{children}</>
  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <SidebarProvider>
      <SaasSidebar />
      <SidebarInset>
        <SaasHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
