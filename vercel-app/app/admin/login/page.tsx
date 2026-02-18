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

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginForm redirectTo="/admin" isAdminPage />}>
      <AdminLoginContent />
    </Suspense>
  )
}
