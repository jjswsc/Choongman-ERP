"use client"

import { LoginForm } from "@/components/login/login-form"

export default function AdminLoginPage() {
  return <LoginForm redirectTo="/admin" isAdminPage={true} />
}
