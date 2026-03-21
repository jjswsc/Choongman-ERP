"use client"

import dynamic from "next/dynamic"
import { LoginFormShellFallback } from "@/components/login/login-form-shell-fallback"

const LoginForm = dynamic(
  () => import("@/components/login/login-form").then((m) => ({ default: m.LoginForm })),
  { ssr: false, loading: () => <LoginFormShellFallback /> }
)

export default function LoginPage() {
  return <LoginForm redirectTo="/" isAdminPage={false} />
}
