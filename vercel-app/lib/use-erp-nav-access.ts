"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { useAiCenterModuleEnabled } from "@/lib/use-ai-center-module"
import { useSaasEnabledModules } from "@/lib/use-saas-enabled-modules"
import {
  getAccessibleErpNavHrefs,
  getAccessibleErpNavMainItems,
  getAccessibleErpNavSections,
  isErpNavHrefAccessible,
  type ErpNavAccessContext,
} from "@/lib/erp-nav-access"

export function useErpNavAccess() {
  const { auth } = useAuth()
  const saasModules = useSaasEnabledModules()
  const aiModuleEnabled = useAiCenterModuleEnabled()

  const ctx = React.useMemo<ErpNavAccessContext>(
    () => ({
      role: auth?.role || "",
      store: auth?.store,
      saasModules,
      aiModuleEnabled,
    }),
    [auth?.role, auth?.store, saasModules, aiModuleEnabled]
  )

  const accessibleHrefs = React.useMemo(() => getAccessibleErpNavHrefs(ctx), [ctx])
  const accessibleHrefSet = React.useMemo(() => new Set(accessibleHrefs), [accessibleHrefs])
  const mainItems = React.useMemo(() => getAccessibleErpNavMainItems(ctx), [ctx])
  const sections = React.useMemo(() => getAccessibleErpNavSections(ctx), [ctx])

  const isNavItemVisible = React.useCallback(
    (href: string) => accessibleHrefSet.has(href) && isErpNavHrefAccessible(href, ctx),
    [accessibleHrefSet, ctx]
  )

  return {
    ctx,
    accessibleHrefs,
    accessibleHrefSet,
    mainItems,
    sections,
    isNavItemVisible,
    saasModules,
  }
}
