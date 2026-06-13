"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import type { SaasScopeClientMeta } from "@/lib/saas-control-plane-scope"
import { SaasScopeProvider } from "@/components/saas/saas-scope-context"

export function SaasScopeLoader({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<SaasScopeClientMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch("/api/getSaasTenantSettings")
        const json = (await res.json()) as { scope?: SaasScopeClientMeta }
        if (!cancelled && json.scope) setScope(json.scope)
      } catch {
        if (!cancelled) setScope(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return <SaasScopeProvider scope={scope}>{children}</SaasScopeProvider>
}
