"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { SaasScopeClientMeta } from "@/lib/saas-control-plane-scope"

const DEFAULT_SCOPE: SaasScopeClientMeta = {
  kind: "platform",
  isPlatform: true,
  isPartner: false,
  partnerId: null,
  partnerName: null,
  defaultMarginPct: 0,
}

const SaasScopeContext = createContext<SaasScopeClientMeta>(DEFAULT_SCOPE)

export function SaasScopeProvider({
  scope,
  children,
}: {
  scope?: SaasScopeClientMeta | null
  children: ReactNode
}) {
  return <SaasScopeContext.Provider value={scope ?? DEFAULT_SCOPE}>{children}</SaasScopeContext.Provider>
}

export function useSaasScope(): SaasScopeClientMeta {
  return useContext(SaasScopeContext)
}
