"use client"

import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/login/login-form"

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect")?.trim()
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/admin"
  const isPosRedirect = redirectTo === "/pos"
  return <LoginForm redirectTo={redirectTo} isAdminPage={!isPosRedirect} />
}
