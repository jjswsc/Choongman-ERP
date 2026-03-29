"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginFormShellFallback } from "@/components/login/login-form-shell-fallback"

const LoginForm = dynamic(
  () => import("@/components/login/login-form").then((m) => ({ default: m.LoginForm })),
  { ssr: false, loading: () => <LoginFormShellFallback /> }
)

function AdminLoginContent() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect")?.trim()
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/admin"
  const isPosRedirect = redirectTo === "/pos"
  const msg = searchParams.get("msg")?.trim()
  const initialNoticeKey = msg === "no_admin" ? "msg_no_admin_permission" : undefined
  return (
    <LoginForm
      redirectTo={redirectTo}
      isAdminPage={!isPosRedirect}
      initialNoticeKey={initialNoticeKey}
    />
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFormShellFallback />}>
      <AdminLoginContent />
    </Suspense>
  )
}
