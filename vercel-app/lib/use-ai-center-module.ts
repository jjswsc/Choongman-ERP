"use client"

import { useAuth } from "@/lib/auth-context"
import { canAccessAiCenter } from "@/lib/permissions"
import { useSaasEnabledModules } from "@/lib/use-saas-enabled-modules"

/** SaaS ai_center 모듈 + 역할. fetch 전까지 true(레거시 UX 유지). */
export function useAiCenterModuleEnabled(): boolean | null {
  const { auth } = useAuth()
  const modules = useSaasEnabledModules()

  if (!auth || !canAccessAiCenter(auth.role || "")) {
    return false
  }
  if (modules == null) return null
  return modules.ai_center !== false
}
