"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/login/login-form"

function AdminLoginContent() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect")?.trim()
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/admin"
  const isPosRedirect = redirectTo === "/pos"
  return <LoginForm redirectTo={redirectTo} isAdminPage={!isPosRedirect} />
}

function LoginFormFallback() {
  return <LoginForm redirectTo="/admin" isAdminPage />
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <AdminLoginContent />
    </Suspense>
  )
}
