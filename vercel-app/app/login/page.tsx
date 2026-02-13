"use client"

import { LoginForm } from "@/components/login/login-form"

export default function LoginPage() {
  return <LoginForm redirectTo="/" isAdminPage={false} />
}
