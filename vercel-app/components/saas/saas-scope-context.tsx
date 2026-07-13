"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { SaasScopeClientMeta } from "@/lib/saas-control-plane-scope-client"

/** 스코프 로드 전 폴백 — 본사 전용 메뉴가 잠깐 보이지 않도록 platform=false */
const UNRESOLVED_SCOPE: SaasScopeClientMeta = {
  kind: "partner",
  isPlatform: false,
  isPartner: false,
  partnerId: null,
  partnerName: null,
  defaultMarginPct: 0,
}

const SaasScopeContext = createContext<SaasScopeClientMeta>(UNRESOLVED_SCOPE)

export function SaasScopeProvider({
  scope,
  children,
}: {
  scope: SaasScopeClientMeta
  children: ReactNode
}) {
  return <SaasScopeContext.Provider value={scope}>{children}</SaasScopeContext.Provider>
}

export function useSaasScope(): SaasScopeClientMeta {
  return useContext(SaasScopeContext)
}
