"use client"

import dynamic from "next/dynamic"
import { LoginFormShellFallback } from "@/components/login/login-form-shell-fallback"

const LoginForm = dynamic(
  () => import("@/components/login/login-form").then((m) => ({ default: m.LoginForm })),
  { ssr: false, loading: () => <LoginFormShellFallback /> }
)

/** 포스 전용 로그인 — 성공 시 /pos 로 이동 */
export default function PosLoginPage() {
  return <LoginForm redirectTo="/pos" isAdminPage={false} />
}
