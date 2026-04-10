"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/login/login-form"
import { LoginFormShellFallback } from "@/components/login/login-form-shell-fallback"
import { LoginNextCacheReset } from "@/components/login-next-cache-reset"

function SaasAdminLoginContent() {
  const searchParams = useSearchParams()
  const msg = searchParams.get("msg")?.trim()
  const initialNoticeKey = msg === "no_admin" ? "msg_no_admin_permission" : undefined
  return (
    <>
      <LoginNextCacheReset />
      <LoginForm redirectTo="/saas-admin" isAdminPage={true} initialNoticeKey={initialNoticeKey} />
    </>
  )
}

export default function SaasAdminLoginPage() {
  return (
    <Suspense fallback={<LoginFormShellFallback />}>
      <SaasAdminLoginContent />
    </Suspense>
  )
}
