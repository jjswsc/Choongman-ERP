"use client"

import * as React from "react"
import { apiFetchWithOffline } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { canAccessAiCenter } from "@/lib/permissions"

/** SaaS ai_center 모듈 + 역할. fetch 전까지 true(레거시 UX 유지). */
export function useAiCenterModuleEnabled(): boolean | null {
  const { auth } = useAuth()
  const [enabled, setEnabled] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (!auth || !canAccessAiCenter(auth.role || "")) {
      setEnabled(false)
      return
    }
    let cancelled = false
    void apiFetchWithOffline("/api/ai/module-status")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setEnabled(true)
          return
        }
        const json = (await res.json()) as { enabled?: boolean }
        if (!cancelled) setEnabled(json.enabled !== false)
      })
      .catch(() => {
        if (!cancelled) setEnabled(true)
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  return enabled
}
