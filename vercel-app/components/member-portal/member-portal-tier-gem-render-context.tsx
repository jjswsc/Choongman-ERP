"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  parseMemberPortalTierGemRenderMode,
  type MemberPortalTierGemRenderMode,
} from "@/lib/member-portal-tier-gem-render"

const TierGemRenderContext = React.createContext<MemberPortalTierGemRenderMode>("svg")

export function MemberPortalTierGemRenderProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const mode = parseMemberPortalTierGemRenderMode(searchParams.get("gem"))

  return <TierGemRenderContext.Provider value={mode}>{children}</TierGemRenderContext.Provider>
}

export function useMemberPortalTierGemRenderMode(): MemberPortalTierGemRenderMode {
  return React.useContext(TierGemRenderContext)
}
