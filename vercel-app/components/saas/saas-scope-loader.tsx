"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import type { SaasScopeClientMeta } from "@/lib/saas-control-plane-scope-client"
import { SaasScopeProvider } from "@/components/saas/saas-scope-context"

/** 레이아웃에서 스코프를 선확정하지 않는 경우에만 사용. 로드 전에는 children을 렌더하지 않는다. */
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

  if (!scope) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <SaasScopeProvider scope={scope}>{children}</SaasScopeProvider>
}
