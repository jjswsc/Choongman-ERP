"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginNextCacheReset } from "@/components/login-next-cache-reset"
import { LoginForm } from "@/components/login/login-form"
import { LoginFormShellFallback } from "@/components/login/login-form-shell-fallback"

function AdminLoginContent() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect")?.trim()
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/admin"
  const isPosRedirect = redirectTo === "/pos"
  const msg = searchParams.get("msg")?.trim()
  const initialNoticeKey = msg === "no_admin" ? "msg_no_admin_permission" : undefined
  return (
    <>
      <LoginNextCacheReset />
      <LoginForm
        redirectTo={redirectTo}
        isAdminPage={!isPosRedirect}
        initialNoticeKey={initialNoticeKey}
      />
    </>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFormShellFallback />}>
      <AdminLoginContent />
    </Suspense>
  )
}
