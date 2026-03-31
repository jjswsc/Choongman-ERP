"use client"

import { LoginNextCacheReset } from "@/components/login-next-cache-reset"
import { LoginForm } from "@/components/login/login-form"

export default function LoginPage() {
  return (
    <>
      <LoginNextCacheReset />
      <LoginForm redirectTo="/" isAdminPage={false} />
    </>
  )
}
