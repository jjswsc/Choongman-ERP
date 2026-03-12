"use client"

import { LoginForm } from "@/components/login/login-form"

/** 포스 전용 로그인 — 성공 시 /pos 로 이동 */
export default function PosLoginPage() {
  return <LoginForm redirectTo="/pos" isAdminPage={false} />
}
